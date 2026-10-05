import { Clock } from 'lucide-react';
import type { Notice } from './view';

const TONE: Record<Notice['tone'], [string, string]> = {
  stale: ['var(--status-pending)', 'var(--status-pending-bg)'],
  failed: ['var(--status-failed)', 'var(--status-failed-bg)'],
  neutral: ['var(--border)', 'var(--surface-200)'],
};

export function NoticeBox({ notice, desktop }: { notice: Notice; desktop?: boolean }) {
  const [fg, bg] = TONE[notice.tone];
  const body = desktop ? 't-body-lg' : 't-body';
  return (
    <div role="status" className={`flex rounded-md ${desktop ? 'gap-3.5 p-5' : 'gap-3 p-4'}`} style={{ background: bg, border: `1px solid ${fg}` }}>
      <Clock size={desktop ? 24 : 22} strokeWidth={2.25} aria-hidden="true" style={{ color: fg, flex: 'none', marginTop: desktop ? 0 : 1 }} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="t-h2">{notice.title}</span>
        {notice.body && <span className={body}>{notice.body}</span>}
        {notice.next && (
          <>
            <span className={desktop ? 't-h2 mt-2.5' : 't-h3 mt-2'}>What happens next</span>
            <span className={body}>{notice.next}</span>
          </>
        )}
      </div>
    </div>
  );
}
