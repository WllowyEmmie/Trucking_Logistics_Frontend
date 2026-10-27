'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type L from 'leaflet';
import { Check, Crosshair, Layers, Minus, Plus, Sparkles, Truck as TruckIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DispatchMap, type LatLng, type MapLink, type MapRoute, type MapStop, type MapTruck } from '@/components/map';
import { api, isConflict, post } from '@/lib/api';
import { useConfig } from '@/lib/config';
import {
  DELIVERIES_KEY,
  detailKey,
  endedAt,
  failReasonOf,
  hasLatLng,
  stopDone,
  useDeliveries,
  useDeliveryDetail,
  useDeliveryDetails,
  useDrivers,
} from '@/lib/deliveries';
import { activeByTruck, hasPosition, isStale, type FailedInfo } from '@/lib/exceptions';
import { formatDuration, formatTime, minutesSince } from '@/lib/format';
import { STATUS_LABEL } from '@/lib/labels';
import { TRUCKS_KEY, usePositions, usePositionsStatus } from '@/lib/positions';
import type { CreateDeliveryResponse, DeliveryListItem, Proposal, Truck } from '@/lib/types';
import { useDark } from '@/lib/useDark';
import { useElementWidth } from '@/lib/useElementWidth';
import { useNow } from '@/lib/useNow';
import { LoadCard } from './LoadCard';
import { DELIVERY_FILTERS, DeliveryList, type AssignError, type DeliveryFilter } from './DeliveryList';
import type { ReopenMode } from '@/lib/reopen';
import { ProposalsPane, type ProposalError } from './ProposalsPane';
import { useSupervisorActions } from '@/lib/supervisor';
import { TruckList, type TruckFilter } from './TruckList';
import { tabCls } from './ui';

type Panel = 'layers' | 'trucks' | 'proposals' | null;
type LayerKey = 'others' | 'idle' | 'callouts' | 'remaining';

/** POST /deliveries/{id}/assign returns the delivery row; only these fields are used. */
type AssignResponse = Pick<DeliveryListItem, 'id' | 'reference' | 'status' | 'truck_id'>;

const PROPOSALS_KEY = ['proposals'] as const;

/** Below this container width (200% zoom on a 1440 screen) the panes become tabs. */
const NARROW_PX = 1000;
/** Markers glide between fixes: about the simulator's/phone's report interval while the socket is
 *  live, and over the 10 s /trucks poll when it's down. */
const MAP_ANIMATE_LIVE_S = 3;
const MAP_ANIMATE_POLL_S = 10;
/** Failed deliveries older than this can't be in the exception window; their detail isn't fetched. */
const FAILED_LOOKBACK_MS = 48 * 60 * 60_000;

type Tab = 'deliveries' | 'map';
/** A truck highlighted from the assign panel, a proposal or an exception; `link` draws the dashed line to the pickup. */
type Hover = { id: string; link: boolean } | null;
interface AssignVars {
  deliveryId: string;
  truckId: string;
  /** A failed delivery: POST /reopen with the mode and truck, which resets its stops and assigns in one go. */
  mode?: ReopenMode;
}
type Decision = { p: Proposal; verb: 'approve' | 'reject' };
type Params = Partial<Record<'d' | 't' | 'f', string | null>>;

const pos = (x: { lat: number; lng: number }): LatLng => ({ lat: x.lat, lng: x.lng });

/** The pending queue (the API's default). */
const fetchProposals = () => api<Proposal[]>('/proposals');

export function ConsoleView() {
  const config = useConfig();
  const tz = config.timezone;
  const now = useNow(10_000);
  const qc = useQueryClient();

  // ---- URL state: ?d=<delivery id>&t=<truck id>&f=pending survives a refresh ----
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const sel = params.get('d');
  const truckSel = params.get('t');
  const fParam = params.get('f') as DeliveryFilter | null;
  const filter: DeliveryFilter = fParam && DELIVERY_FILTERS.has(fParam) ? fParam : 'all';
  const setParams = useCallback(
    (patch: Params) => {
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue;
        if (v === null || (k === 'f' && v === 'all')) next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  // ---- Local view state ----
  const [exp, setExp] = useState<string | null>(sel);
  const [hover, setHover] = useState<Hover>(null);
  const [tFilter, setTFilter] = useState<TruckFilter>('all');
  const [tab, setTab] = useState<Tab>('deliveries');
  const [panel, setPanel] = useState<Panel>(null);
  const [mapStyle, setMapStyle] = useState<'map' | 'sat'>('map');
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({ others: true, idle: true, callouts: true, remaining: true });
  const [lmap, setLmap] = useState<L.Map | null>(null);
  const dark = useDark();
  const accent = dark ? '#FFCF33' : '#2F7CF6';
  const [propNote, setPropNote] = useState<string | null>(null);
  // A refused approve or reject, kept where its card was until dismissed: a stale proposal is
  // expired by the server and leaves the pending list on the next refetch.
  const [propErrors, setPropErrors] = useState<Record<string, ProposalError>>({});
  const [creating, setCreating] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, AssignError>>({});
  const setNote = (id: string, v: string | null) =>
    setNotes((n) => {
      const c = { ...n };
      if (v) c[id] = v;
      else delete c[id];
      return c;
    });
  const setError = (id: string, v: AssignError | null) =>
    setErrors((n) => {
      const c = { ...n };
      if (v) c[id] = v;
      else delete c[id];
      return c;
    });

  const [rootRef, width] = useElementWidth<HTMLDivElement>();
  const narrow = (width ?? (typeof window !== 'undefined' ? window.innerWidth : 1440)) < NARROW_PX;

  // ---- Data ----
  const deliveriesQ = useDeliveries();
  const trucksQ = usePositions();
  const posStatus = usePositionsStatus();
  const driversQ = useDrivers();
  const proposalsQ = useQuery({
    queryKey: PROPOSALS_KEY,
    queryFn: fetchProposals,
    refetchInterval: 30_000,
    enabled: config.agent_enabled,
  });
  const doneQ = useSupervisorActions(config.agent_enabled && config.auto_assign);
  const deliveries = useMemo(() => deliveriesQ.data ?? [], [deliveriesQ.data]);
  const trucks = useMemo(() => trucksQ.data ?? [], [trucksQ.data]);
  const T = useMemo(() => new Map(trucks.map((t) => [t.id, t])), [trucks]);
  const drivers = useMemo(() => new Map((driversQ.data ?? []).map((d) => [d.id, d])), [driversQ.data]);
  const driverName = useCallback((id: string | null) => (id ? (drivers.get(id)?.name ?? null) : null), [drivers]);
  const onTruck = useMemo(() => activeByTruck(deliveries), [deliveries]);

  // Detail (stops, events, customer link) only where it's shown: the selected and the expanded row.
  const selQ = useDeliveryDetail(sel);
  const expQ = useDeliveryDetail(exp && exp !== sel ? exp : null);
  const detailOf = (id: string | null) => (id === sel ? selQ.data : id === exp ? expQ.data : undefined);

  // Failure time and reason are only in a delivery's events: fetch detail for recent failures.
  const failedIds = useMemo(
    () => deliveries.filter((d) => d.status === 'failed' && now - Date.parse(d.created_at) < FAILED_LOOKBACK_MS).map((d) => d.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deliveries],
  );
  const failedQs = useDeliveryDetails(failedIds);
  const failed: FailedInfo = {};
  failedQs.forEach((q, i) => {
    const at = q.data ? endedAt(q.data.events) : null;
    if (at) failed[failedIds[i]!] = { at, reason: failReasonOf(q.data!.events) };
  });

  const allProposals = config.agent_enabled ? (proposalsQ.data ?? []) : [];
  const flags = allProposals.filter((p) => p.kind === 'flag');
  const changes = allProposals.filter((p) => p.kind === 'change');

  // Needs attention lives on the Notifications page now; the list carries no red flags.
  const attentionIds = useMemo(() => new Set<string>(), []);

  const selD = sel ? (deliveries.find((d) => d.id === sel) ?? null) : null;
  const selDetail = selQ.data;

  // ---- Assign: optimistic, rolled back on error; a 409 is shown word for word and refetches ----
  const assign = useMutation({
    mutationFn: (v: AssignVars) =>
      v.mode
        ? post<AssignResponse>(`/deliveries/${encodeURIComponent(v.deliveryId)}/reopen`, { mode: v.mode, truck_id: v.truckId })
        : post<AssignResponse>(`/deliveries/${encodeURIComponent(v.deliveryId)}/assign`, { truck_id: v.truckId }),
    onMutate: async (v) => {
      await Promise.all([qc.cancelQueries({ queryKey: DELIVERIES_KEY }), qc.cancelQueries({ queryKey: TRUCKS_KEY })]);
      const prevD = qc.getQueryData<DeliveryListItem[]>(DELIVERIES_KEY);
      const prevT = qc.getQueryData<Truck[]>(TRUCKS_KEY);
      qc.setQueryData<DeliveryListItem[]>(DELIVERIES_KEY, (ds) =>
        ds?.map((x) => (x.id === v.deliveryId ? { ...x, status: 'assigned', truck_id: v.truckId } : x)),
      );
      qc.setQueryData<Truck[]>(TRUCKS_KEY, (ts) => ts?.map((x) => (x.id === v.truckId ? { ...x, status: 'on_delivery' } : x)));
      setError(v.deliveryId, null);
      setNote(v.deliveryId, null);
      setHover(null);
      return { prevD, prevT };
    },
    onError: (e, v, ctx) => {
      if (ctx?.prevD) qc.setQueryData(DELIVERIES_KEY, ctx.prevD);
      if (ctx?.prevT) qc.setQueryData(TRUCKS_KEY, ctx.prevT);
      setError(v.deliveryId, { conflict: isConflict(e), message: e.message, truckId: v.truckId, mode: v.mode });
    },
    onSuccess: (d, v) => {
      qc.setQueryData<DeliveryListItem[]>(DELIVERIES_KEY, (ds) =>
        ds?.map((x) => (x.id === d.id ? { ...x, status: d.status, truck_id: d.truck_id } : x)),
      );
      const t = T.get(v.truckId);
      const plate = t?.plate_number ?? 'the truck';
      const who = driverName(t?.driver_id ?? null);
      setNote(d.id, `${v.mode ? 'Sent out again on' : 'Assigned'} ${plate}. ${who ?? 'The driver'} has the delivery on their phone.`);
    },
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey: DELIVERIES_KEY });
      void qc.invalidateQueries({ queryKey: TRUCKS_KEY });
      void qc.invalidateQueries({ queryKey: detailKey(v.deliveryId) });
      if (config.agent_enabled) void qc.invalidateQueries({ queryKey: PROPOSALS_KEY });
    },
  });

  // ---- Proposals: approve runs the action server-side; the console never calls /assign for it ----
  const decide = useMutation({
    mutationFn: ({ p, verb }: Decision) => post<Proposal>(`/proposals/${encodeURIComponent(p.id)}/${verb}`),
    onMutate: ({ p }) => {
      setPropNote(null);
      setPropErrors(({ [p.id]: _gone, ...rest }) => rest);
      setHover(null);
    },
    onSuccess: (_r, { p, verb }) => {
      qc.setQueryData<Proposal[]>(PROPOSALS_KEY, (ps) => ps?.filter((x) => x.id !== p.id));
      const ref = deliveries.find((d) => d.id === (p.action?.delivery_id ?? p.delivery_id))?.reference ?? 'the delivery';
      const plate = (p.action && T.get(p.action.truck_id)?.plate_number) ?? 'The truck';
      setPropNote(verb === 'approve' ? `Approved. ${plate} has ${ref}.` : `Rejected. ${p.title} won't be applied.`);
    },
    onError: (e, { p, verb }) => {
      const index = changes.findIndex((x) => x.id === p.id);
      setPropErrors((m) => ({ ...m, [p.id]: { p, verb, conflict: isConflict(e), message: e.message, index: Math.max(0, index) } }));
    },
    onSettled: (_r, _e, { p }) => {
      void qc.invalidateQueries({ queryKey: PROPOSALS_KEY });
      void qc.invalidateQueries({ queryKey: DELIVERIES_KEY });
      void qc.invalidateQueries({ queryKey: TRUCKS_KEY });
      const d = p.action?.delivery_id ?? p.delivery_id;
      if (d) void qc.invalidateQueries({ queryKey: detailKey(d) });
    },
  });
  const deciding = decide.isPending ? decide.variables : undefined;
  const pendingVars = assign.isPending ? assign.variables : undefined;

  // ---- Cancel: the API frees the truck; refetch rather than guess ----
  const [cancelErrors, setCancelErrors] = useState<Record<string, string>>({});
  const cancel = useMutation({
    mutationFn: (deliveryId: string) => post(`/deliveries/${encodeURIComponent(deliveryId)}/cancel`),
    onMutate: (id) => setCancelErrors(({ [id]: _gone, ...rest }) => rest),
    onSuccess: (_r, id) => {
      const ref = deliveries.find((d) => d.id === id)?.reference ?? 'The delivery';
      setNote(id, `${ref} cancelled.`);
      setError(id, null);
    },
    onError: (e, id) => setCancelErrors((m) => ({ ...m, [id]: e.message })),
    onSettled: (_r, _e, id) => {
      void qc.invalidateQueries({ queryKey: DELIVERIES_KEY });
      void qc.invalidateQueries({ queryKey: TRUCKS_KEY });
      void qc.invalidateQueries({ queryKey: detailKey(id) });
    },
  });

  function doAssign(deliveryId: string, truckId: string) {
    setParams({ d: deliveryId, f: filter === 'pending' ? 'all' : undefined });
    setExp(deliveryId);
    assign.mutate({ deliveryId, truckId });
  }

  function doReopen(deliveryId: string, truckId: string, mode: ReopenMode) {
    setParams({ d: deliveryId, f: filter === 'failed' ? 'all' : undefined });
    setExp(deliveryId);
    assign.mutate({ deliveryId, truckId, mode });
  }

  // ---- Selection ----
  function selectDelivery(id: string) {
    setParams({ d: id });
    setExp(id);
    setHover(null);
    setTab('deliveries');
  }
  function toggleTruck(id: string) {
    setParams({ t: truckSel === id ? null : id, d: null, f: 'all' });
    setExp(null);
    setHover(null);
  }
  function onCreated(r: CreateDeliveryResponse) {
    const d = r.delivery;
    const item: DeliveryListItem = { id: d.id, reference: d.reference, status: d.status, customer_name: d.customer_name, truck_id: null, created_at: d.created_at, due_by: null, eta: null, finished_at: null };
    qc.setQueryData<DeliveryListItem[]>(DELIVERIES_KEY, (ds) => [item, ...(ds ?? []).filter((x) => x.id !== d.id)]);
    void qc.invalidateQueries({ queryKey: DELIVERIES_KEY });
    setCreating(false);
    setParams({ d: d.id, t: null, f: 'all' });
    setExp(d.id);
    setNote(d.id, `Created ${d.reference}. Assign a truck below, or leave it pending.`);
  }

  // ---- The Copilot's focus_map / open_panel: it names a delivery by reference, a truck by plate ----
  useEffect(() => {
    const on = (e: Event) => {
      const ui = (e as CustomEvent<{ kind?: string; target?: string }>).detail ?? {};
      const target = String(ui.target ?? '').trim().toLowerCase();
      if (!target) return;
      if (ui.kind === 'delivery') {
        const d = deliveries.find((x) => x.reference.toLowerCase() === target || x.id === target);
        if (d) selectDelivery(d.id);
      } else if (ui.kind === 'truck') {
        const t = trucks.find((x) => x.plate_number.toLowerCase() === target || x.id === target);
        if (t && truckSel !== t.id) toggleTruck(t.id);
      }
    };
    window.addEventListener('copilot-ui', on);
    return () => window.removeEventListener('copilot-ui', on);
  });

  // ---- Proposals ----
  function showProposal(p: Proposal) {
    const d = p.action?.delivery_id ?? p.delivery_id;
    const t = p.action?.truck_id ?? p.truck_id;
    if (d) {
      setParams({ d, t: null, f: 'all' });
      setExp(d);
    }
    setHover(t ? { id: t, link: true } : null);
    if (narrow) setTab('map');
    setPanel(null);
  }

  // ---- Map ----
  const map = useMemo(() => {
    const hl = new Set<string>();
    if (selD?.truck_id) hl.add(selD.truck_id);
    if (truckSel) hl.add(truckSel);
    if (hover) hl.add(hover.id);
    const pendingSel = selD?.status === 'pending';

    const mTrucks: MapTruck[] = trucks
      .filter((t) => hasPosition(t) && t.status !== 'maintenance')
      .map((t) => {
        const stale = isStale(t, config, now);
        const mins = stale && t.last_seen_at ? minutesSince(t.last_seen_at, now) : 0;
        const on = hl.has(t.id);
        return {
          id: t.id,
          lat: t.lat!,
          lng: t.lng!,
          state: stale ? 'stale' : t.status === 'on_delivery' ? 'live' : 'idle',
          size: on || stale || (pendingSel && t.status === 'available') ? 'md' : 'sm',
          selected: on,
          label: stale ? `${t.plate_number} · ${formatDuration(mins)}` : on ? t.plate_number : null,
          aria: `${t.plate_number}, ${driverName(t.driver_id) ?? 'no driver'}, ${STATUS_LABEL[t.status]}${stale ? `, no position for ${formatDuration(mins)}` : ''}${t.driver_id && t.driver_on_shift === false ? ', driver off shift' : ''}`,
        };
      });

    let stops: MapStop[] = [];
    let route: MapRoute | null = null;
    const links: MapLink[] = [];
    let note: string | null = null;
    let fitKey: string;
    let fitPoints: LatLng[];

    if (selD) {
      const t = selD.truck_id ? T.get(selD.truck_id) : undefined;
      const tPos = t && hasPosition(t) ? pos(t) : null;
      const sStops = (selDetail?.stops ?? []).filter(hasLatLng);
      stops = sStops.map((s) => ({ id: s.id, n: s.sequence, kind: s.stop_type, lat: s.lat, lng: s.lng, done: stopDone(s), address: s.address }));
      const pts = sStops.map(pos);
      if (selD.status === 'in_transit' && tPos) {
        route = { travelled: [...sStops.filter(stopDone).map(pos), tPos], remaining: [tPos, ...sStops.filter((s) => !stopDone(s)).map(pos)] };
      } else if (selD.status === 'completed') route = { travelled: pts, remaining: [] };
      else route = { travelled: [], remaining: pts };
      const pk = pts[0];
      if (pk && selD.status === 'assigned' && tPos) links.push({ a: tPos, b: pk });
      const h = hover?.link ? T.get(hover.id) : undefined;
      if (pk && h && hasPosition(h) && h.id !== selD.truck_id) links.push({ a: pos(h), b: pk });
      note = `${selD.reference} · ${selD.customer_name}`;
      // Refit once the stops arrive, not on every poll.
      fitKey = `d:${selD.id}:${pts.length}`;
      fitPoints = tPos ? [...pts, tPos] : pts;
    } else if (truckSel) {
      const t = T.get(truckSel);
      note = t ? `${t.plate_number} · ${driverName(t.driver_id) ?? 'no driver'}` : null;
      fitKey = `t:${truckSel}:${!!t}`;
      fitPoints = t && hasPosition(t) ? [pos(t)] : [];
    } else {
      fitKey = `all:${trucks.length > 0}`;
      fitPoints = mTrucks.map(pos);
    }
    return { trucks: mTrucks, stops, route, links, note, fitKey, fitPoints };
  }, [selD, selDetail, truckSel, hover, trucks, T, config, now, driverName]);

  // The Layers menu: other trucks on a delivery, free ones, the callouts, the road still to go.
  const shownTrucks = map.trucks.filter((t) => t.selected || (t.state === 'idle' ? layers.idle : layers.others));
  const shownRoute = map.route && !layers.remaining ? { ...map.route, remaining: [] } : map.route;
  const recenter = () => {
    if (!lmap) return;
    const p = map.fitPoints;
    if (p.length === 1) lmap.setView([p[0]!.lat, p[0]!.lng], Math.max(lmap.getZoom(), 12));
    else if (p.length > 1) {
      const wide = lmap.getSize().x > 700;
      lmap.fitBounds(
        p.map((x) => [x.lat, x.lng] as [number, number]),
        wide ? { paddingTopLeft: [340, 90], paddingBottomRight: [90, 80], maxZoom: 14 } : { padding: [56, 56], maxZoom: 14 },
      );
    }
  };

  // ---- Layout: the Loads design. The list on the left, the map filling the rest with the load
  // card, the map controls and the trucks / proposals panels floating over it. ----
  const show = (k: Tab) => !narrow || tab === k;
  const selPlate = selD?.truck_id ? (T.get(selD.truck_id)?.plate_number ?? null) : null;
  const selDriver = selD?.truck_id ? driverName(T.get(selD.truck_id)?.driver_id ?? null) : null;
  const floatBox = 'rounded-xl border border-divider bg-surface-100 text-ink';
  const shadow = { boxShadow: 'var(--shadow-card)' };
  const segBtn = (on: boolean) => ({
    background: on ? 'var(--brand)' : 'transparent',
    color: on ? 'var(--brand-ink)' : 'var(--ink)',
    minHeight: 32,
    minWidth: 0,
  });
  const ctl = 'grid h-[38px] w-[38px] place-items-center border-0 bg-transparent text-ink';
  const lastCheck = proposalsQ.dataUpdatedAt
    ? `Last checked ${formatTime(new Date(proposalsQ.dataUpdatedAt), tz, config.locale)} · ${deliveries.length} deliveries, ${trucks.length} trucks`
    : 'Not checked yet';
  const layerOpts: [LayerKey, string, number | null][] = [
    ['others', 'Trucks on a delivery', map.trucks.filter((t) => t.state !== 'idle' && !t.selected).length],
    ['idle', 'Free trucks', map.trucks.filter((t) => t.state === 'idle').length],
    ['callouts', 'Pickup & drop-off labels', null],
    ['remaining', 'Route still to go', null],
  ];

  return (
    <div ref={rootRef} className="flex bg-surface-100 text-ink" style={narrow ? { minHeight: '100%', flexDirection: 'column' } : { height: '100%', overflow: 'hidden' }}>
      {narrow && (
        <div role="tablist" aria-label="Panes" className="flex gap-1 px-3 pt-3">
          {(
            [
              ['deliveries', 'Deliveries'],
              ['map', 'Map'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={tabCls(tab === k)}>
              {label}
            </button>
          ))}
        </div>
      )}

      <section
        id="pane-deliveries"
        aria-label="Deliveries"
        className="min-h-0 min-w-0 flex-col"
        style={{ display: show('deliveries') ? 'flex' : 'none', flex: narrow ? '1 1 auto' : creating ? '0 0 560px' : '0 0 380px' }}
      >
        <DeliveryList
          deliveries={deliveries}
          trucks={trucks}
          driverName={driverName}
          detailOf={detailOf}
          failed={failed}
          config={config}
          now={now}
          loading={deliveriesQ.isPending}
          error={deliveriesQ.isError && !deliveriesQ.data ? deliveriesQ.error : null}
          onRetryLoad={() => void deliveriesQ.refetch()}
          attentionIds={attentionIds}
          filter={filter}
          truckSel={truckSel}
          sel={sel}
          exp={exp}
          hover={hover?.id ?? null}
          notes={notes}
          errors={errors}
          assigningId={pendingVars?.deliveryId ?? null}
          creating={creating}
          onFilter={(f) => setParams({ f })}
          onClearTruck={() => setParams({ t: null })}
          onClearAll={() => setParams({ f: 'all', t: null })}
          onSelect={(id) => {
            setParams({ d: sel === id ? null : id });
            setHover(null);
            if (narrow && sel !== id) setTab('map');
          }}
          onToggle={(id) => {
            setExp(exp === id ? null : id);
            setParams({ d: id });
          }}
          onHover={(id) => setHover(id ? { id, link: true } : null)}
          onAssign={doAssign}
          onReopen={doReopen}
          onCancel={(id) => cancel.mutate(id)}
          cancellingId={cancel.isPending ? (cancel.variables ?? null) : null}
          cancelErrors={cancelErrors}
          onCreating={(open) => {
            setCreating(open);
            if (open) setTab('deliveries');
          }}
          onCreated={onCreated}
        />
      </section>

      <section
        id="pane-map"
        aria-label="Map"
        className="relative min-w-[280px] flex-auto p-3 sm:ps-0"
        style={{ display: show('map') ? 'block' : 'none', height: narrow ? 560 : 'auto' }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-[18px] border border-divider">
          <DispatchMap
            variant="console"
            tiles={mapStyle === 'sat' ? 'satellite' : dark ? 'dark' : 'street'}
            dark={dark && mapStyle !== 'sat'}
            accent={accent}
            callouts={layers.callouts}
            fitPadding={{ tl: [340, 90], br: [90, 80] }}
            onMap={setLmap}
            center={config.center}
            zoom={config.default_zoom}
            trucks={shownTrucks}
            stops={map.stops}
            route={shownRoute}
            links={map.links}
            dim={posStatus === 'down'}
            staleMinutes={config.stale_minutes}
            animateSeconds={posStatus === 'live' ? MAP_ANIMATE_LIVE_S : MAP_ANIMATE_POLL_S}
            onTruck={toggleTruck}
            fitKey={map.fitKey}
            fitPoints={map.fitPoints}
            ariaLabel="Fleet map"
          >
            {selD && (
              <LoadCard
                key={selD.id}
                d={selD}
                detail={selDetail}
                plate={selPlate}
                driver={selDriver}
                config={config}
                now={now}
                accent={accent}
                onClose={() => setParams({ d: null })}
              />
            )}
            {!selD && map.note && (
              <div className={`absolute start-3.5 top-3.5 z-[1000] px-3 py-2 text-[13px] font-semibold ${floatBox}`} style={shadow}>
                {map.note}
              </div>
            )}

            {/* Top right: map style, layers, trucks, proposals. */}
            <div className="pointer-events-none absolute start-3.5 end-3.5 top-3.5 z-[1000] flex flex-wrap justify-end gap-2">
              <div className={`pointer-events-auto flex gap-0.5 p-1 ${floatBox}`} style={shadow}>
                {(
                  [
                    ['map', 'Map'],
                    ['sat', 'Satellite'],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={mapStyle === k} onClick={() => setMapStyle(k)} className="rounded-[9px] border-0 px-3.5 text-[12.5px] font-medium" style={segBtn(mapStyle === k)}>
                    {label}
                  </button>
                ))}
              </div>
              {(
                [
                  ['layers', 'Layers', Layers, null],
                  ['trucks', 'Trucks', TruckIcon, trucks.length],
                  ...(config.agent_enabled ? ([['proposals', 'Proposals', Sparkles, changes.length]] as const) : []),
                ] as const
              ).map(([k, label, Icon, n]) => (
                <button
                  key={k}
                  type="button"
                  aria-expanded={panel === k}
                  onClick={() => setPanel(panel === k ? null : k)}
                  className={`pointer-events-auto flex h-10 items-center gap-1.5 px-3.5 text-[12.5px] font-medium ${floatBox}`}
                  style={{ ...shadow, borderColor: panel === k ? 'var(--ink)' : undefined, minHeight: 40 }}
                >
                  <Icon size={15} strokeWidth={1.6} aria-hidden="true" />
                  {label}
                  {n !== null && n > 0 && (
                    <span
                      className="rounded-md px-1.5 text-[10.5px]"
                      style={k === 'proposals' ? { background: 'var(--agent)', color: '#fff' } : { background: 'var(--surface-200)' }}
                    >
                      {n}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {panel === 'layers' && (
              <div className={`absolute end-3.5 top-[62px] z-[1100] flex w-[240px] flex-col gap-1 p-3.5 ${floatBox}`} style={shadow}>
                <span className="mb-1 text-[12px] font-semibold">Show on map</span>
                {layerOpts.map(([k, label, n]) => {
                  const on = layers[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setLayers((l) => ({ ...l, [k]: !l[k] }))}
                      className="flex items-center gap-2.5 border-0 bg-transparent px-1 text-start text-[12.5px] text-ink"
                      style={{ minHeight: 34 }}
                    >
                      <span
                        className="grid h-[18px] w-[18px] flex-none place-items-center rounded-[5px] border-[1.5px]"
                        style={{ background: on ? 'var(--brand)' : 'transparent', borderColor: on ? 'var(--brand)' : 'var(--border)', color: 'var(--brand-ink)' }}
                      >
                        {on && <Check size={11} strokeWidth={3} aria-hidden="true" />}
                      </span>
                      <span className="flex-1">{label}</span>
                      {n !== null && <span className="text-[11px] text-ink-muted">{n}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {panel === 'trucks' && (
              <div className={`absolute end-3.5 top-[62px] bottom-[180px] z-[1100] flex w-[320px] max-w-[calc(100%-28px)] flex-col overflow-hidden ${floatBox}`} style={shadow}>
                <TruckList
                  trucks={trucks}
                  config={config}
                  driverName={driverName}
                  deliveryOf={(id) => onTruck.get(id)}
                  filter={tFilter}
                  onFilter={setTFilter}
                  isSelected={(t) => truckSel === t.id || selD?.truck_id === t.id}
                  onSelect={toggleTruck}
                />
              </div>
            )}
            {panel === 'proposals' && config.agent_enabled && (
              <div className={`absolute end-3.5 top-[62px] bottom-[180px] z-[1100] flex w-[340px] max-w-[calc(100%-28px)] flex-col overflow-hidden ${floatBox}`} style={shadow}>
                <ProposalsPane
                  proposals={changes}
                  open
                  collapsible={false}
                  note={propNote}
                  lastCheck={lastCheck}
                  errors={propErrors}
                  busy={deciding ? { id: deciding.p.id, verb: deciding.verb } : null}
                  config={config}
                  onToggle={() => setPanel(null)}
                  onShow={showProposal}
                  onApprove={(p) => decide.mutate({ p, verb: 'approve' })}
                  onReject={(p) => decide.mutate({ p, verb: 'reject' })}
                  onDismiss={(id) => setPropErrors(({ [id]: _gone, ...rest }) => rest)}
                  done={doneQ.data}
                  onShowDelivery={selectDelivery}
                />
              </div>
            )}

            {posStatus === 'down' && (
              <div role="status" className={`absolute start-3.5 bottom-3.5 z-[1000] px-3 py-2 text-[12.5px] font-semibold ${floatBox}`} style={{ ...shadow, borderColor: 'var(--attention)' }}>
                Positions aren&apos;t live · reconnecting
                {trucksQ.dataUpdatedAt ? ` · last update ${formatTime(new Date(trucksQ.dataUpdatedAt), tz, config.locale)}` : ''}
              </div>
            )}

            {/* Bottom right: recentre and zoom. */}
            <div className="absolute end-3.5 bottom-[84px] z-[1000] flex flex-col gap-2">
              <button type="button" aria-label="Recentre" onClick={recenter} className={`${ctl} rounded-[11px] bg-surface-100`} style={{ ...shadow, minHeight: 38, minWidth: 38 }}>
                <Crosshair size={17} strokeWidth={1.6} aria-hidden="true" />
              </button>
              <div className="flex flex-col overflow-hidden rounded-[11px] bg-surface-100" style={shadow}>
                <button type="button" aria-label="Zoom in" onClick={() => lmap?.zoomIn()} className={`${ctl} border-b border-divider`} style={{ minHeight: 38, minWidth: 38 }}>
                  <Plus size={16} strokeWidth={1.7} aria-hidden="true" />
                </button>
                <button type="button" aria-label="Zoom out" onClick={() => lmap?.zoomOut()} className={ctl} style={{ minHeight: 38, minWidth: 38 }}>
                  <Minus size={16} strokeWidth={1.7} aria-hidden="true" />
                </button>
              </div>
            </div>
          </DispatchMap>
        </div>
      </section>
    </div>
  );

}
