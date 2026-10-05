import { http, HttpResponse, delay } from 'msw';
import { API_URL } from '@/lib/api';
import type { Config, FailReason, LocationPing } from '@/lib/types';
import { MockError, mock } from './data';

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

const json = async <T,>(req: Request) => ((await req.json().catch(() => ({}))) as T);

export const handlers = [
  http.get(u('/health'), () => run(() => ({ ok: true }))),

  http.get(u('/config'), () => run(() => mock.config())),
  http.put(u('/config'), async ({ request }) => {
    const body = await json<Partial<Config>>(request);
    return run(() => mock.putConfig(body));
  }),

  http.get(u('/trucks'), () => run(() => mock.trucks())),
  http.post(u('/trucks'), async ({ request }) => {
    const body = await json<Parameters<typeof mock.createTruck>[0]>(request);
    return run(() => mock.createTruck(body), 201);
  }),

  http.get(u('/drivers'), () => run(() => mock.drivers())),
  http.post(u('/drivers'), async ({ request }) => {
    const body = await json<Parameters<typeof mock.createDriver>[0]>(request);
    return run(() => mock.createDriver(body), 201);
  }),

  http.get(u('/deliveries'), ({ request }) => run(() => mock.deliveries(new URL(request.url).searchParams.get('truck_id')))),
  http.post(u('/deliveries'), async ({ request }) => {
    const body = await json<Parameters<typeof mock.createDelivery>[0]>(request);
    return run(() => mock.createDelivery(body), 201);
  }),
  http.post(u('/deliveries/:id/assign'), async ({ request, params }) => {
    const body = await json<{ truck_id: string }>(request);
    return run(() => mock.assign(String(params.id), body.truck_id));
  }),
  http.post(u('/deliveries/:id/start'), ({ params }) => run(() => mock.start(String(params.id)))),
  http.post(u('/deliveries/:id/complete'), ({ params }) => run(() => mock.complete(String(params.id)))),
  http.post(u('/deliveries/:id/fail'), async ({ request, params }) => {
    const body = await json<{ reason: FailReason }>(request);
    return run(() => mock.fail(String(params.id), body.reason));
  }),

  http.post(u('/locations'), async ({ request }) => {
    const body = await json<{ truck_id: string; pings: LocationPing[] }>(request);
    return run(() => mock.locations(body.truck_id, body.pings ?? []));
  }),

  http.get(u('/track/:token'), ({ params }) => run(() => mock.track(String(params.token)))),

  // TODO(proposals-api): not on the real API yet; the console treats its 404 as empty.
  http.get(u('/proposals'), () => run(() => mock.proposals())),
];
