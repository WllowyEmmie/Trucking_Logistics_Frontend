'use client';

import { API_URL } from '@/lib/api';
import type { AppConfig } from '@/lib/config';
import { formatDistance, formatWhen, haversineKm } from '@/lib/format';
import type { Stop } from '@/lib/types';

/** A drop-off's proof of delivery: who received it, when, the signature and the photo. */
export function ProofView({ deliveryId, stop, config }: { deliveryId: string; stop: Stop; config: AppConfig }) {
  const p = stop.proof;
  if (!p) return null;
  const base = `${API_URL}/deliveries/${encodeURIComponent(deliveryId)}/stops/${encodeURIComponent(stop.id)}/proof`;
  // Taken somewhere else than the stop: worth a second look.
  const km = p.lat != null && p.lng != null && stop.lat != null && stop.lng != null ? haversineKm({ lat: p.lat, lng: p.lng }, { lat: stop.lat, lng: stop.lng }) : null;
  const far = km != null && km > 0.3;
  return (
    <div className="mt-1 flex flex-col gap-1.5">
      <span className="t-body-sm">
        Received by <b>{p.receiver_name}</b> · {formatWhen(p.captured_at, config.timezone, config.locale)}
      </span>
      {far && (
        <span className="t-body-sm font-semibold text-attention">
          Taken {formatDistance(km!, config.units, config.locale)} from the stop
        </span>
      )}
      {(p.has_signature || p.has_photo) && (
        <span className="flex flex-wrap items-end gap-2">
          {p.has_signature && (
            <a href={`${base}/signature`} target="_blank" rel="noreferrer" aria-label={`Open ${p.receiver_name}'s signature`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${base}/signature`} alt={`${p.receiver_name}'s signature`} className="h-14 w-auto rounded-md border border-border bg-white p-1" />
            </a>
          )}
          {p.has_photo && (
            <a href={`${base}/photo`} target="_blank" rel="noreferrer" aria-label="Open the delivery photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${base}/photo`} alt="Delivery photo" className="h-14 w-14 rounded-md border border-border object-cover" />
            </a>
          )}
        </span>
      )}
      {!p.has_signature && <span className="t-body-sm text-ink-muted">No signature</span>}
    </div>
  );
}
