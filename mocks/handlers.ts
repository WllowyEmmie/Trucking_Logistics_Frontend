import { http, HttpResponse, delay, ws } from 'msw';
import { API_URL } from '@/lib/api';
import { positionsSocketUrl, type WsMessage } from '@/lib/positions';
import { MockError, mock } from './data';

// The Go API's routes (internal/api/routes.go), answered from mocks/data.ts.
const u = (path: string) => `${API_URL}${path}`;

/** Runs a mock call and turns MockError into the API's `{ error }` body. */
async function run(fn: () => unknown, status = 200) {
  await delay(120);
  try {
    const body = await fn();
    return body === undefined ? new HttpResponse(null, { status: 204 }) : HttpResponse.json(body as object, { status });
  } catch (e) {
    if (e instanceof MockError) return HttpResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

/** The handlers decode JSON first and answer "invalid json" on failure, as the Go handlers do. */
async function json<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new MockError(400, 'invalid json');
  }
}
const withBody = <T,>(req: Request, fn: (b: T) => unknown, status = 200) => run(async () => fn(await json<T>(req)), status);

// GET /ws (internal/api/ws.go): a snapshot on connect, then one `position` frame per truck that
// reported. The Go API pushes on POST /locations; the mock simulation moves on read, so check each second.
const positions = ws.link(positionsSocketUrl());
const positionsSocket = positions.addEventListener('connection', ({ client }) => {
  const send = (m: WsMessage) => client.send(JSON.stringify(m));
  const seen = new Map<string, string | null>();
  const trucks = mock.trucks();
  trucks.forEach((t) => seen.set(t.id, t.last_seen_at));
  send({ type: 'snapshot', trucks: trucks.map(({ id, lng, lat, last_seen_at, status }) => ({ id, lng, lat, last_seen_at, status })) });
  const timer = setInterval(() => {
    for (const { id, lng, lat, last_seen_at } of mock.trucks()) {
      if (!last_seen_at || seen.get(id) === last_seen_at) continue;
      seen.set(id, last_seen_at);
      send({ type: 'position', truck: { id, lng, lat, last_seen_at } });
    }
  }, 1_000);
  client.addEventListener('close', () => clearInterval(timer));
});

export const handlers = [
  positionsSocket,
  http.get(u('/health'), () => run(() => mock.health())),
  http.get(u('/config'), () => run(() => mock.config())),
  http.get(u('/track/:token'), ({ params }) => run(() => mock.track(String(params.token)))),

  http.post(u('/locations'), ({ request }) => withBody<Parameters<typeof mock.locations>[0]>(request, (b) => mock.locations(b), 201)),

  http.get(u('/trucks'), () => run(() => mock.trucks())),
  http.post(u('/trucks'), ({ request }) => withBody<Parameters<typeof mock.createTruck>[0]>(request, (b) => mock.createTruck(b), 201)),
  http.patch(u('/trucks/:id'), ({ request, params }) =>
    withBody<Parameters<typeof mock.updateTruck>[1]>(request, (b) => mock.updateTruck(String(params.id), b)),
  ),

  http.get(u('/drivers'), () => run(() => mock.drivers())),
  http.post(u('/drivers'), ({ request }) => withBody<Parameters<typeof mock.createDriver>[0]>(request, (b) => mock.createDriver(b), 201)),

  http.get(u('/deliveries'), ({ request }) => run(() => mock.deliveries(new URL(request.url).searchParams.get('status')))),
  http.post(u('/deliveries'), ({ request }) => withBody<Parameters<typeof mock.createDelivery>[0]>(request, (b) => mock.createDelivery(b), 201)),
  http.get(u('/deliveries/:id'), ({ params }) => run(() => mock.delivery(String(params.id)))),
  http.post(u('/deliveries/:id/assign'), ({ request, params }) =>
    withBody<{ truck_id?: string }>(request, (b) => mock.assign(String(params.id), b.truck_id)),
  ),
  http.post(u('/deliveries/:id/start'), ({ params }) => run(() => mock.start(String(params.id)))),
  http.post(u('/deliveries/:id/complete'), ({ params }) => run(() => mock.complete(String(params.id)))),
  http.post(u('/deliveries/:id/cancel'), ({ params }) => run(() => mock.cancel(String(params.id)))),
  http.post(u('/deliveries/:id/fail'), ({ request, params }) => withBody<{ reason?: string }>(request, (b) => mock.fail(String(params.id), b.reason))),
  http.post(u('/deliveries/:id/stops/:stopId/arrive'), ({ params }) => run(() => mock.advanceStop(String(params.id), String(params.stopId), 'arrive'))),
  http.post(u('/deliveries/:id/stops/:stopId/complete'), ({ params }) => run(() => mock.advanceStop(String(params.id), String(params.stopId), 'complete'))),

  // TODO(proposals-api): the API has no /proposals route; chi answers a plain-text 404, and the
  // console counts that as "nothing to review".
  http.get(u('/proposals'), () => new HttpResponse('404 page not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })),
];
