import { Phone } from 'lucide-react';
import type { ReactNode } from 'react';
import { DispatchMap } from '@/components/map';
import { StatusPill } from '@/components/StatusPill';
import { History } from './History';
import { NoticeBox } from './NoticeBox';
import { StopTimeline } from './StopTimeline';
import type { TrackingView } from './view';

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/** `ask`: the customer's question box, when the agent is on (the page decides). */
export function TrackingPhone({ v, fitKey, seconds, ask }: { v: TrackingView; fitKey: string; seconds: number; ask?: ReactNode }) {
  const found = v.state !== 'not_found';
  return (
    <div className="flex min-h-dvh flex-col bg-surface-100 text-ink">
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-divider px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <span className="t-h3">{v.operator}</span>
          {v.ref && <span className="t-mono-sm text-ink-muted">{v.ref}</span>}
        </div>
        {v.pill && <StatusPill status={v.pill} size="md" />}
      </header>

      {v.map && (
        <div className="relative border-b border-border" style={{ height: 325 }}>
          <DispatchMap
            center={v.map.fit[0] ?? { lat: 53.7, lng: -1.5 }}
            trucks={v.map.trucks}
            stops={v.map.stops}
            route={v.map.route}
            note={v.map.note}
            dim={v.map.dim}
            fitKey={fitKey}
            fitPoints={v.map.fit}
            animateSeconds={seconds}
            ariaLabel="Delivery map"
          />
        </div>
      )}

      <main className="flex flex-col gap-6 px-4 pt-5 pb-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="t-display m-0">{v.headline}</h1>
          <p className="t-body m-0 text-ink-muted" style={{ textWrap: 'pretty' }}>
            {v.sub}
          </p>
          {v.updated && <span className="t-body-sm font-semibold text-ink-muted">{v.updated}</span>}
        </div>

        {v.notice && <NoticeBox notice={v.notice} />}

        {v.eta && (
          <div className="flex flex-col gap-1">
            <span className="t-label text-ink-muted">{v.eta.label}</span>
            <div className="flex flex-wrap items-baseline gap-x-2.5">
              <span className="t-display">{v.eta.value}</span>
              {v.tzTag && (
                <span className="t-label rounded-sm border border-status-assigned px-1.5 py-0.5 text-status-assigned">{v.tzTag}</span>
              )}
            </div>
            {v.eta.detail && <span className="t-body text-ink-muted">{v.eta.detail}</span>}
          </div>
        )}

        {ask}

        {v.stops.length > 0 && (
          <div className="flex flex-col gap-3">
            <span className="t-label text-ink-muted">Stops</span>
            <StopTimeline stops={v.stops} />
          </div>
        )}

        {v.history.length > 0 && <History items={v.history} />}

        {found && v.phone && (
          <a
            href={telHref(v.phone)}
            role="button"
            className="flex min-h-12 items-center justify-center gap-2.5 rounded-md border border-border px-4 py-2.5 text-center text-[15px] font-semibold text-ink no-underline"
          >
            <Phone size={18} strokeWidth={2.25} aria-hidden="true" />
            Call {v.operator}
          </a>
        )}

        {found && v.tzNote && <p className="t-body-sm m-0 text-ink-muted">{v.tzNote}</p>}
      </main>
    </div>
  );
}
