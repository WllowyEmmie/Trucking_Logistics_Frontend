import { Phone } from 'lucide-react';
import type { ReactNode } from 'react';
import { DispatchMap } from '@/components/map';
import { StatusPill } from '@/components/StatusPill';
import { History } from './History';
import { NoticeBox } from './NoticeBox';
import { StopTimeline } from './StopTimeline';
import { telHref } from './TrackingPhone';
import type { TrackingView } from './view';

/** `ask`: the customer's question box, when the agent is on (the page decides). `terms`: the small-print notice. */
export function TrackingDesktop({ v, fitKey, seconds, ask, terms }: { v: TrackingView; fitKey: string; seconds: number; ask?: ReactNode; terms?: ReactNode }) {
  const found = v.state !== 'not_found';
  return (
    <div className="flex h-dvh bg-surface-100 text-ink">
      {v.map && (
        <div className="relative min-w-0 flex-auto">
          <DispatchMap
            center={v.map.fit[0] ?? { lat: 53.7, lng: -1.5 }}
            trucks={v.map.trucks}
            stops={v.map.stops}
            route={v.map.route}
            note={v.map.note}
            dim={v.map.dim}
            controls
            fitKey={fitKey}
            fitPoints={v.map.fit}
            animateSeconds={seconds}
            ariaLabel="Delivery map"
          />
        </div>
      )}
      <aside
        className="scroll-pad flex h-full flex-col overflow-auto border-s border-border"
        style={{ flex: v.map ? '0 0 600px' : '1 1 auto' }}
      >
        <div className="sticky top-0 z-[2] flex items-center justify-between gap-4 border-b border-divider bg-surface-100 px-8 py-4">
          <div className="flex min-w-0 flex-col">
            <span className="t-h2">{v.operator}</span>
            {v.ref && <span className="t-mono text-ink-muted">{v.ref}</span>}
          </div>
          {v.updated && <span className="t-body-sm text-end font-semibold text-ink-muted">{v.updated}</span>}
        </div>

        <main className="flex max-w-[640px] flex-col gap-8 p-8">
          <div className="flex flex-col gap-3">
            {v.pill && (
              <div className="flex">
                <StatusPill status={v.pill} size="lg" />
              </div>
            )}
            <h1 className="t-display-lg m-0">{v.headline}</h1>
            <p className="t-body-lg m-0 text-ink-muted" style={{ textWrap: 'pretty' }}>
              {v.sub}
            </p>
          </div>

          {v.notice && <NoticeBox notice={v.notice} desktop />}

          {v.eta && (
            <div className="flex flex-col gap-1">
              <span className="t-label text-ink-muted">{v.eta.label}</span>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span style={{ fontSize: 64, lineHeight: '68px', fontWeight: 700, letterSpacing: -1.5 }}>{v.eta.value}</span>
                {v.tzTag && (
                  <span className="t-label rounded-sm border border-status-assigned px-1.5 py-0.5 text-status-assigned">{v.tzTag}</span>
                )}
              </div>
              {v.eta.detail && <span className="t-body-lg text-ink-muted">{v.eta.detail}</span>}
            </div>
          )}

          {v.facts.length > 0 && (
            <dl
              className="m-0 grid gap-x-8 gap-y-5 border-y border-divider py-5"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
            >
              {v.facts.map((f) => (
                <div key={f.k} className="flex min-w-0 flex-col gap-1">
                  <dt className="t-label text-ink-muted">{f.k}</dt>
                  <dd className="t-body wrap-anywhere m-0 font-semibold">{f.v}</dd>
                </div>
              ))}
            </dl>
          )}

          {terms}

          {ask}

          {v.stops.length > 0 && (
            <div className="flex flex-col gap-3.5">
              <h2 className="t-h2 m-0">Stops</h2>
              <StopTimeline stops={v.stops} desktop />
            </div>
          )}

          {v.history.length > 0 && <History items={v.history} desktop />}

          {found && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              {v.phone && (
                <a
                  href={telHref(v.phone)}
                  role="button"
                  className="inline-flex min-h-11 items-center gap-2.5 rounded-md border border-border px-4 py-2.5 text-[15px] font-semibold text-ink no-underline"
                >
                  <Phone size={18} strokeWidth={2.25} aria-hidden="true" />
                  Call {v.operator} · {v.phone}
                </a>
              )}
              {v.tzNote && <span className="t-body-sm text-ink-muted">{v.tzNote}</span>}
            </div>
          )}
        </main>
      </aside>
    </div>
  );
}
