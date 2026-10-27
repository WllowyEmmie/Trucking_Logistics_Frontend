export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api';

/**
 * Called when the API answers 401 to a signed-in screen: the session expired or was ended
 * elsewhere (a PIN reset signs a driver out). Providers points it at the sign-in state.
 */
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Which app is calling. The console and the driver app have separate sign-in cookies, so one browser
 * can be signed in to both; this header tells the API which one the call means.
 */
const appHeader = (): Record<string, string> =>
  typeof window === 'undefined' ? {} : { 'X-App': window.location.pathname.startsWith('/driver') ? 'driver' : 'console' };

/** Every call goes through this. A 409 is a state conflict: show `message` as-is and refetch. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...appHeader(), ...init?.headers },
    });
  } catch {
    // status 0 = network failure; the driver queue keeps these for retry.
    throw new ApiError(0, 'Could not reach the server. Check the connection and try again.');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    // /auth/* answers 401 for a wrong password or "not signed in": that's for the caller.
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized?.();
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

export const del = <T = void>(path: string) => api<T>(path, { method: 'DELETE' });


export const isConflict = (e: unknown): e is ApiError => e instanceof ApiError && e.status === 409;
export const isNotFound = (e: unknown): e is ApiError => e instanceof ApiError && e.status === 404;

// ---- The dispatch agent: a separate service on its own origin ----

/**
 * Same origin by default: Next rewrites /agent/* to the agent (AGENT_BACKEND_URL), so the session
 * cookie goes with the console's questions and the agent can check it's a dispatcher asking.
 */
export const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? '/agent';
/** An ask makes several model and tool calls; past this it's stuck, not thinking. */
export const ASK_TIMEOUT_MS = 90_000;
/** ApiError status for an ask that ran past ASK_TIMEOUT_MS. */
export const TIMED_OUT = -1;

/**
 * POST to the agent → `answer`. Errors are ApiErrors: status 0 when the agent can't be reached,
 * TIMED_OUT when it took too long, otherwise the agent's own `detail`. Aborting `signal` (a newer
 * question replacing this one) rejects with the AbortError, which callers ignore.
 */
async function agentAnswer(path: string, body: unknown, signal: AbortSignal): Promise<string> {
  const timeout = AbortSignal.timeout(ASK_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${AGENT_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, timeout]),
    });
  } catch (e) {
    if (signal.aborted) throw e;
    if (timeout.aborted) throw new ApiError(TIMED_OUT, `No answer after ${ASK_TIMEOUT_MS / 1000} s.`);
    throw new ApiError(0, `The agent isn't reachable at ${AGENT_URL}.`);
  }
  if (!res.ok) {
    if (res.status === 401 && path === '/ask') onUnauthorized?.();
    // FastAPI errors are {detail}: a string from the agent, a list for a validation error.
    const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
    throw new ApiError(res.status, typeof body.detail === 'string' ? body.detail : `The agent answered ${res.status} ${res.statusText}.`);
  }
  return ((await res.json()) as { answer: string }).answer;
}

/** The console's Ask box: POST /ask, with the dispatcher tools. */
export const askAgent = (question: string, signal: AbortSignal) => agentAnswer('/ask', { question }, signal);

/**
 * The tracking page's question box: POST /track/{token}/ask. The agent answers from that one
 * delivery's /track data only, in the viewer's time zone. 429 when a link asks too often.
 */
export const askAboutDelivery = (token: string, question: string, timezone: string, signal: AbortSignal) =>
  agentAnswer(`/track/${encodeURIComponent(token)}/ask`, { question, timezone }, signal);
