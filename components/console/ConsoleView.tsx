'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
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
import { activeByTruck, deriveExceptions, hasPosition, isStale, type ExceptionRow, type FailedInfo } from '@/lib/exceptions';
import { formatDuration, formatTime, minutesSince, tzAbbr } from '@/lib/format';
import { STATUS_LABEL } from '@/lib/labels';
import { TRUCKS_KEY, usePositions, usePositionsStatus } from '@/lib/positions';
import type { CreateDeliveryResponse, DeliveryListItem, Proposal, Truck } from '@/lib/types';
import { useAcks } from '@/lib/acks';
import { useElementWidth } from '@/lib/useElementWidth';
import { useNow } from '@/lib/useNow';
import { ConsoleHeader } from './ConsoleHeader';
import { DELIVERY_FILTERS, DeliveryList, type AssignError, type DeliveryFilter } from './DeliveryList';
import type { ReopenMode } from '@/lib/reopen';
import { ProposalsPane, type ProposalError } from './ProposalsPane';
import { useSupervisorActions } from '@/lib/supervisor';
import { TruckList, type TruckFilter } from './TruckList';
import { tabCls } from './ui';

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

type Tab = 'deliveries' | 'map' | 'trucks' | 'proposals';
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
  const [propOpen, setPropOpen] = useState(false);
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

  const allExceptions = deriveExceptions(deliveries, trucks, driverName, failed, flags, config, now);
  // Dismissed ones leave the count, the table and the rows' red flag; they can be shown and restored.
  const acks = useAcks();
  const exceptions = allExceptions.filter((x) => !acks.has(x.key));
  const dismissed = allExceptions.filter((x) => acks.has(x.key));
  const attentionIds = new Set(exceptions.flatMap((x) => (x.deliveryId ? [x.deliveryId] : [])));
  function dismissException(x: ExceptionRow) {
    acks.ack(x.key);
    // An agent flag is the agent's to raise and everyone's to see: dismissing it rejects it on
    // the server, so it leaves every dispatcher's list, not just this browser's.
    if (x.agent && x.key.startsWith('agent-')) {
      void post(`/proposals/${encodeURIComponent(x.key.slice('agent-'.length))}/reject`)
        .catch(() => undefined)
        .finally(() => void qc.invalidateQueries({ queryKey: PROPOSALS_KEY }));
    }
  }

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
  function onException(x: ExceptionRow) {
    setParams({ d: x.deliveryId, t: null, f: 'all' });
    setExp(x.deliveryId);
    setHover(x.truckId ? { id: x.truckId, link: false } : null);
    setTab('deliveries');
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
  }

  // ---- Header ----
  const nowD = new Date(now);
  const clock = `${formatTime(nowD, tz, config.locale)} ${tzAbbr(tz, nowD, config.locale)}`;

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
      stops = sStops.map((s) => ({ id: s.id, n: s.sequence, kind: s.stop_type, lat: s.lat, lng: s.lng, done: stopDone(s) }));
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

  // ---- Layout ----
  const show = (k: Tab) => !narrow || tab === k;
  const tabs: [Tab, string][] = [
    ['deliveries', 'Deliveries'],
    ['map', 'Map'],
    ['trucks', 'Trucks'],
  ];
  if (config.agent_enabled) tabs.push(['proposals', 'Proposals']);
  const propIsOpen = narrow || propOpen;
  const lastCheck = proposalsQ.dataUpdatedAt
    ? `Last checked ${formatTime(new Date(proposalsQ.dataUpdatedAt), tz, config.locale)} · ${deliveries.length} deliveries, ${trucks.length} trucks`
    : 'Not checked yet';

  return (
    <div
      ref={rootRef}
      className="flex flex-col bg-surface-200 text-ink"
      style={narrow ? { minHeight: '100dvh' } : { height: '100dvh', overflow: 'hidden' }}
    >
      <ConsoleHeader
        config={config}
        clock={clock}
        exceptions={exceptions}
        dismissed={dismissed}
        onDismiss={dismissException}
        onRestore={(x) => acks.restore(x.key)}
        stacked={narrow}
        onView={onException}
      />

      {narrow && (
        <div role="tablist" aria-label="Panes" className="flex flex-wrap gap-2 border-b border-border bg-surface-100 px-3 py-2">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`tab-${k}`}
              aria-selected={tab === k}
              aria-controls={`pane-${k}`}
              onClick={() => setTab(k)}
              className={tabCls(tab === k)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="flex min-h-0" style={{ flex: narrow ? '0 0 auto' : '1 1 auto', flexDirection: narrow ? 'column' : 'row' }}>
        <section
          id="pane-deliveries"
          aria-label="Deliveries"
          role={narrow ? 'tabpanel' : undefined}
          className="min-h-0 min-w-0 flex-col border-e border-border bg-surface-100"
          // Wider while the new-delivery form is open: the map gives up the room.
          style={{ display: show('deliveries') ? 'flex' : 'none', flex: narrow ? '1 1 auto' : creating ? '0 0 560px' : '0 0 400px' }}
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
          role={narrow ? 'tabpanel' : undefined}
          className="relative min-w-[280px] flex-auto"
          style={{ display: show('map') ? 'block' : 'none', height: narrow ? 420 : 'auto' }}
        >
          <DispatchMap
            center={config.center}
            zoom={config.default_zoom}
            trucks={map.trucks}
            stops={map.stops}
            route={map.route}
            links={map.links}
            note={map.note}
            alert={
              posStatus === 'down'
                ? `Positions aren't live · reconnecting${trucksQ.dataUpdatedAt ? ` · last update ${formatTime(new Date(trucksQ.dataUpdatedAt), tz, config.locale)}` : ''}`
                : null
            }
            dim={posStatus === 'down'}
            controls
            legend
            staleMinutes={config.stale_minutes}
            animateSeconds={posStatus === 'live' ? MAP_ANIMATE_LIVE_S : MAP_ANIMATE_POLL_S}
            onTruck={toggleTruck}
            fitKey={map.fitKey}
            fitPoints={map.fitPoints}
            ariaLabel="Fleet map"
          />
        </section>

        <section
          id="pane-trucks"
          aria-label="Trucks"
          role={narrow ? 'tabpanel' : undefined}
          className="min-h-0 min-w-0 flex-col border-s border-border bg-surface-100"
          style={{ display: show('trucks') ? 'flex' : 'none', flex: narrow ? '1 1 auto' : '0 0 300px' }}
        >
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
        </section>

        {config.agent_enabled && (
          <aside
            id="pane-proposals"
            aria-label="Agent proposals"
            role={narrow ? 'tabpanel' : undefined}
            className="min-h-0 min-w-0 flex-col border-s border-border bg-surface-100"
            style={{ display: show('proposals') ? 'flex' : 'none', flex: narrow ? '1 1 auto' : propIsOpen ? '0 0 340px' : '0 0 56px' }}
          >
            <ProposalsPane
              proposals={changes}
              open={propIsOpen}
              collapsible={!narrow}
              note={propNote}
              lastCheck={lastCheck}
              errors={propErrors}
              busy={deciding ? { id: deciding.p.id, verb: deciding.verb } : null}
              config={config}
              onToggle={() => setPropOpen((o) => !o)}
              onShow={showProposal}
              onApprove={(p) => decide.mutate({ p, verb: 'approve' })}
              onReject={(p) => decide.mutate({ p, verb: 'reject' })}
              onDismiss={(id) => setPropErrors(({ [id]: _gone, ...rest }) => rest)}
              done={doneQ.data}
              onShowDelivery={selectDelivery}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
