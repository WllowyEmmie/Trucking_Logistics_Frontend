import { isConflict } from '@/lib/api';

/** "Not added" with the server message word for word (409s prefixed), or the success note. */
export function FormResult({ error, ok }: { error: Error | null; ok: string | null }) {
  if (error) {
    return (
      <div role="alert" className="flex flex-col gap-1 rounded-md border border-status-failed bg-status-failed-bg px-3 py-2.5">
        <span className="t-body-sm font-bold">Not added</span>
        <span className="t-mono">{isConflict(error) ? `409 · ${error.message}` : error.message}</span>
      </div>
    );
  }
  if (ok) {
    return (
      <div role="status" className="t-body-sm rounded-md border border-status-completed bg-status-completed-bg px-3 py-2.5 font-semibold">
        {ok}
      </div>
    );
  }
  return null;
}
