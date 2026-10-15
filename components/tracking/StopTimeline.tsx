import type { StopDot, TimelineStop } from './view';

// [fill, border, time colour]
const DOT: Record<StopDot, [string, string, string]> = {
  done: ['var(--ink)', '2px solid var(--ink)', 'var(--ink-muted)'],
  next: ['var(--accent-bg)', '4px solid var(--status-transit)', 'var(--status-transit)'],
  todo: ['var(--surface-100)', '2px solid var(--border)', 'var(--ink-muted)'],
  failed: ['var(--status-failed)', '2px solid var(--status-failed)', 'var(--status-failed)'],
  cancelled: ['var(--surface-100)', '2px dashed var(--border)', 'var(--ink-muted)'],
};

export function StopTimeline({ stops, desktop }: { stops: TimelineStop[]; desktop?: boolean }) {
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {stops.map((s, i) => {
        const [bg, bd, tc] = DOT[s.dot];
        const last = i === stops.length - 1;
        return (
          <li
            key={s.key}
            className="grid"
            style={{ gridTemplateColumns: desktop ? '20px minmax(0,1fr) auto' : '20px minmax(0,1fr)', columnGap: desktop ? 16 : 12 }}
          >
            <div className="flex flex-col items-center">
              <span aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none rounded-full" style={{ background: bg, border: bd }} />
              <span aria-hidden="true" className="my-1 w-0.5 flex-1 bg-border" style={{ opacity: last ? 0 : 1 }} />
            </div>
            <div className={`flex min-w-0 flex-col gap-0.5 ${desktop ? 'pb-5' : 'pb-[18px]'}`}>
              <span className="t-label" style={{ color: s.mine ? 'var(--ink)' : 'var(--ink-muted)' }}>
                {s.label}
              </span>
              <span className={`${desktop ? 't-body-lg' : 't-body'} wrap-anywhere`} style={{ fontWeight: s.mine ? 700 : 500 }}>
                {s.main}
              </span>
              {!desktop && s.time && (
                <span className="t-body-sm font-semibold" style={{ color: tc }}>
                  {s.time}
                </span>
              )}
            </div>
            {desktop && (
              <span className="t-body pt-3.5 text-end font-semibold" style={{ color: tc }}>
                {s.time}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
