
/**
 * "Not added" with the server message word for word, or the success note. `title`
 * replaces "Not added" when the add went through but the follow-up PATCH didn't.
 */
export function FormResult({ error, ok, title = 'Not added' }: { error: Error | null; ok: string | null; title?: string }) {
  if (error) {
    return (
      <div role="alert" className="flex flex-col gap-1 rounded-md border border-status-failed bg-status-failed-bg px-3 py-2.5">
        <span className="t-body-sm font-bold">{title}</span>
        <span className="t-body-sm">{error.message}</span>
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
