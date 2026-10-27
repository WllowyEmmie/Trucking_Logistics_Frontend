'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useDeliveryDetail } from '@/lib/deliveries';
import type { DeliveryDetailResponse } from '@/lib/types';

// What a Copilot change will do, laid out for a person: labelled rows, stops as a numbered route,
// ids shown as the plate / reference / name the console already knows, no raw JSON or coordinates.

const LABELS: Record<string, string> = {
  customer_name: 'Customer',
  customer_phone: 'Phone',
  customer_email: 'Email',
  goods: 'Goods',
  delivery_id: 'Delivery',
  truck_id: 'Truck',
  driver_id: 'Driver',
  due_by: 'Due',
  plate_number: 'Plate',
  status: 'Status',
  reason: 'Reason',
  mode: 'How',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HIDDEN = /(^|_)(lat|lng|latitude|longitude)$|^idempotency_key$/;

const label = (k: string) => LABELS[k] ?? (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, ' ');

/** A UUID as the console shows it: a delivery's reference, a truck's plate, a person's name. */
function nameOf(qc: QueryClient, id: string): string | null {
  for (const q of qc.getQueryCache().getAll()) {
    const d = q.state.data as unknown;
    const list = Array.isArray(d) ? d : d && typeof d === 'object' && 'delivery' in d ? [(d as { delivery: unknown }).delivery] : [];
    for (const x of list) {
      if (x && typeof x === 'object' && (x as { id?: unknown }).id === id) {
        const o = x as { reference?: string; plate_number?: string; name?: string };
        const n = o.reference ?? o.plate_number ?? o.name;
        if (n) return n;
      }
    }
  }
  return null;
}

interface Stop {
  stop_type?: string;
  type?: string;
  address?: string;
  contact_name?: string;
  contact_phone?: string;
}

function Stops({ stops }: { stops: Stop[] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
      {stops.map((s, i) => {
        const kind = (s.stop_type ?? s.type ?? '').toLowerCase();
        const pickup = kind === 'pickup';
        return (
          <li key={i} className="flex items-start gap-2">
            <span
              className="mt-[1px] grid size-[18px] shrink-0 place-items-center rounded-full text-[10.5px] font-bold"
              style={{ background: pickup ? 'var(--marker-pickup)' : 'var(--marker-dropoff)', color: '#fff' }}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span className="min-w-0 text-[12.5px] leading-snug text-ink">
              <span className="font-semibold">{pickup ? 'Pickup' : kind === 'dropoff' ? 'Drop-off' : `Stop ${i + 1}`}</span>
              <span className="text-ink-muted"> · {s.address ?? 'no address'}</span>
              {(s.contact_name || s.contact_phone) && (
                <span className="block text-ink-muted">{[s.contact_name, s.contact_phone].filter(Boolean).join(' · ')}</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function show(qc: QueryClient, v: unknown): string {
  if (typeof v === 'string' && UUID.test(v)) return nameOf(qc, v) ?? `…${v.slice(-6)}`;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.map((x) => show(qc, x)).join(', ');
  if (v && typeof v === 'object')
    return Object.entries(v)
      .filter(([k, x]) => !HIDDEN.test(k) && x !== null && x !== '')
      .map(([k, x]) => `${label(k)}: ${show(qc, x)}`)
      .join(' · ');
  return String(v).replace(/_/g, ' ');
}

/** The delivery a Copilot change names (reference or id), from what the console already loaded. */
function deliveryIdOf(qc: QueryClient, ref: string): string | null {
  if (UUID.test(ref)) return ref;
  const want = ref.trim().toUpperCase();
  for (const q of qc.getQueryCache().getAll()) {
    const d = q.state.data as unknown;
    if (!Array.isArray(d)) continue;
    for (const x of d) {
      const o = x as { id?: string; reference?: string };
      if (o && o.reference && (o.reference.toUpperCase() === want || o.reference.endsWith(`-${want}`))) return o.id ?? null;
    }
  }
  return null;
}

interface StopEditArg {
  stop: number;
  address?: string;
  contact_name?: string;
  contact_phone?: string;
}

/** update_delivery: each field as before → after, so a wrong edit shows before it's approved. */
function UpdateDelivery({ args }: { args: Record<string, unknown> }) {
  const qc = useQueryClient();
  const id = deliveryIdOf(qc, String(args.delivery ?? ''));
  const detail = useDeliveryDetail(id, false).data as DeliveryDetailResponse | undefined;
  const d = detail?.delivery;
  const rows: [string, string | null | undefined, string][] = [];
  const add = (k: string, before: string | null | undefined, after: unknown) => {
    if (after === undefined || after === null) return;
    rows.push([k, before, String(after)]);
  };
  add('Customer', d?.customer_name, args.customer_name);
  add('Phone', d?.customer_phone, args.customer_phone);
  add('Goods', d?.goods_desc, args.goods);
  for (const s of (args.stops as StopEditArg[] | undefined) ?? []) {
    const was = detail?.stops.find((x) => x.sequence === s.stop);
    const name = was ? `${was.stop_type === 'pickup' ? 'Pickup' : 'Drop-off'} ${s.stop}` : `Stop ${s.stop}`;
    add(`${name} address`, was?.address, s.address);
    add(`${name} contact`, was?.contact_name, s.contact_name);
    add(`${name} phone`, was?.contact_phone, s.contact_phone);
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12.5px] font-semibold text-ink">{d ? (detail?.delivery.reference ?? '') : String(args.delivery ?? '')}</span>
      <dl className="m-0 flex flex-col gap-2">
        {rows.map(([k, before, after]) => (
          <div key={k} className="flex flex-col gap-0.5">
            <dt className="text-[11.5px] font-medium tracking-wide text-ink-subtle uppercase">{k}</dt>
            <dd className="m-0 text-[12.5px] break-words">
              {detail && (
                <>
                  <span className="text-ink-muted line-through decoration-1">{before || 'none'}</span>
                  <span className="text-ink-subtle"> → </span>
                </>
              )}
              <span className="font-semibold text-ink">{after === '' ? 'none' : after}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ActionDetails({ name, args, fallback }: { name?: string; args: Record<string, unknown>; fallback: string }) {
  const qc = useQueryClient();
  if (name === 'update_delivery') return <UpdateDelivery args={args} />;
  const rows = Object.entries(args).filter(([k, v]) => !HIDDEN.test(k) && v !== null && v !== undefined && v !== '');
  if (!rows.length) return <span className="text-[12.5px] text-ink-muted">{fallback}</span>;
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="pt-[1px] text-[11.5px] font-medium tracking-wide text-ink-subtle uppercase">{label(k)}</dt>
          <dd className="m-0 min-w-0 text-[12.5px] break-words text-ink">
            {k === 'stops' && Array.isArray(v) ? <Stops stops={v as Stop[]} /> : show(qc, v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
