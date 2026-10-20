import { http, HttpResponse, delay, ws } from 'msw';
import { AGENT_URL, API_URL } from '@/lib/api';
import { positionsSocketUrl, type WsMessage } from '@/lib/positions';
import { mockAuth } from './auth';
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

/**
 * The agent's POST /ask (a separate service). Mock mode answers one question from the mock fleet,
 * after a pause like a real ask, so the console never reaches a real agent reading real data.
 */
const askAgent = http.post(`${AGENT_URL}/ask`, async ({ request }) => {
  const { question = '' } = (await request.json().catch(() => ({}))) as { question?: string };
  await delay(1800);
  if (!/free|available|idle/i.test(question)) {
    return HttpResponse.json({ answer: "In mock mode I can only answer **which trucks are free**. Run the agent against the Go API for anything else." });
  }
  const names = new Map(mock.drivers().map((d) => [d.id, d.name]));
  const free = mock.trucks().filter((t) => t.status === 'available');
  const rows = free.map((t) => `| ${t.plate_number} | ${t.model ?? '—'} | ${(t.driver_id && names.get(t.driver_id)) ?? 'no driver'} |`);
  const table = ['| Truck | Model | Driver |', '|---|---|---|', ...rows].join('\n');
  return HttpResponse.json({ answer: `**${free.length} ${free.length === 1 ? 'truck is' : 'trucks are'} free.**\n\n${table}` });
});

/** The agent's POST /track/{token}/ask: a plain answer from the mock's own /track data. */
const askAboutDelivery = http.post(`${AGENT_URL}/track/:token/ask`, async ({ params }) => {
  await delay(1500);
  try {
    const t = mock.track(String(params.token));
    const done = t.stops.filter((s) => s.status === 'completed').length;
    return HttpResponse.json({
      answer: `In mock mode I can only summarise: ${t.reference} is ${t.status.replace('_', ' ')}, with ${done} of ${t.stops.length} stops done.`,
    });
  } catch {
    return HttpResponse.json({ detail: 'delivery not found' }, { status: 404 });
  }
});

/** The API's /auth routes. */
const authHandlers = [
  http.get(u('/auth/me'), () => {
    const me = mockAuth.me();
    return me ? HttpResponse.json(me) : HttpResponse.json({ error: 'not signed in' }, { status: 401 });
  }),
  http.post(u('/auth/login'), async ({ request }) => {
    const b = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
    const me = mockAuth.login(b.email ?? '', b.password ?? '');
    return me ? HttpResponse.json(me) : HttpResponse.json({ error: 'wrong email or password' }, { status: 401 });
  }),
  http.post(u('/auth/driver-login'), async ({ request }) => {
    const b = (await request.json().catch(() => ({}))) as { phone?: string; pin?: string };
    const me = mockAuth.driverLogin(b.phone ?? '', b.pin ?? '');
    return me ? HttpResponse.json(me) : HttpResponse.json({ error: 'wrong phone number or PIN' }, { status: 401 });
  }),
  http.post(u('/auth/logout'), () => {
    mockAuth.logout();
    return new HttpResponse(null, { status: 204 });
  }),
  http.post(u('/drivers/:id/pin/generate'), ({ params }) => {
    if (!mock.drivers().some((d) => d.id === params.id)) return HttpResponse.json({ error: 'driver not found' }, { status: 404 });
    const pin = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    mockAuth.setPin(String(params.id), pin);
    return HttpResponse.json({ pin }, { headers: { 'Cache-Control': 'no-store' } });
  }),
  http.post(u('/drivers/:id/pin'), async ({ request, params }) => {
    const b = (await request.json().catch(() => ({}))) as { pin?: string };
    if (!/^\d{4,8}$/.test(b.pin ?? '')) return HttpResponse.json({ error: 'PIN must be 4 to 8 digits' }, { status: 400 });
    if (!mock.drivers().some((d) => d.id === params.id)) return HttpResponse.json({ error: 'driver not found' }, { status: 404 });
    mockAuth.setPin(String(params.id), b.pin!);
    return new HttpResponse(null, { status: 204 });
  }),
];

export const handlers = [
  ...authHandlers,
  positionsSocket,
  askAgent,
  askAboutDelivery,
  http.get(u('/health'), () => run(() => mock.health())),
  http.get(u('/config'), () => run(() => mock.config())),
  http.put(u('/config'), ({ request }) => withBody<Parameters<typeof mock.saveConfig>[0]>(request, (b) => mock.saveConfig(b))),
  http.post(u('/config/check'), ({ request }) => withBody<Parameters<typeof mock.checkArea>[0]>(request, (b) => mock.checkArea(b))),
  http.get(u('/geocode'), ({ request }) => run(() => mock.geocode(new URL(request.url).searchParams.get('q')))),
  http.get(u('/track/:token'), ({ params }) => run(() => mock.track(String(params.token)))),

  http.post(u('/locations'), ({ request }) => withBody<Parameters<typeof mock.locations>[0]>(request, (b) => mock.locations(b), 201)),

  http.get(u('/trucks'), () => run(() => mock.trucks())),
  http.post(u('/trucks'), ({ request }) => withBody<Parameters<typeof mock.createTruck>[0]>(request, (b) => mock.createTruck(b), 201)),
  http.patch(u('/trucks/:id'), ({ request, params }) =>
    withBody<Parameters<typeof mock.updateTruck>[1]>(request, (b) => mock.updateTruck(String(params.id), b)),
  ),

  // Every mock driver has a PIN (1234 unless changed), so all can sign in.
  http.get(u('/drivers'), () => run(() => mock.drivers().map((d) => ({ ...d, has_pin: true })))),
  http.post(u('/drivers'), ({ request }) =>
    withBody<Parameters<typeof mock.createDriver>[0] & { pin?: string; generate_pin?: boolean }>(
      request,
      (b) => {
        const d = mock.createDriver(b);
        if (b.pin) mockAuth.setPin(d.id, b.pin);
        if (b.generate_pin) {
          const pin = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
          mockAuth.setPin(d.id, pin);
          return { ...d, pin };
        }
        return d;
      },
      201,
    ),
  ),

  http.get(u('/deliveries'), ({ request }) => {
    const q = new URL(request.url).searchParams;
    return run(() => mock.deliveries(q.get('status'), q.get('board') === '1'));
  }),
  http.get(u('/deliveries/history'), ({ request }) => run(() => mock.history(new URL(request.url).searchParams))),
  http.post(u('/deliveries'), ({ request }) => withBody<Parameters<typeof mock.createDelivery>[0]>(request, (b) => mock.createDelivery(b), 201)),
  http.get(u('/deliveries/:id'), ({ params }) => run(() => mock.delivery(String(params.id)))),
  http.post(u('/deliveries/:id/assign'), ({ request, params }) =>
    withBody<{ truck_id?: string }>(request, (b) => mock.assign(String(params.id), b.truck_id)),
  ),
  http.post(u('/deliveries/:id/reopen'), ({ request, params }) =>
    withBody<{ mode?: string; truck_id?: string }>(request, (b) => mock.reopen(String(params.id), b.mode, b.truck_id)),
  ),
  http.post(u('/deliveries/:id/due'), ({ request, params }) =>
    withBody<{ due_by?: string | null }>(request, (b) => mock.setDue(String(params.id), b.due_by)),
  ),
  // Driver shifts and proof of delivery (internal/api/shift.go, proof.go), kept simple.
  http.post(u('/auth/me/shift'), ({ request }) =>
    withBody<{ on?: boolean }>(request, (b) => ({ on_shift: !!b.on, since: b.on ? new Date().toISOString() : null })),
  ),
  http.post(u('/deliveries/:id/stops/:stopId/proof'), ({ request, params }) =>
    withBody<{ receiver_name?: string; photo?: string | null; signature?: string | null }>(request, (b) =>
      mock.saveProof(String(params.id), String(params.stopId), b),
    ),
  ),
  http.post(u('/deliveries/:id/start'), ({ params }) => run(() => mock.start(String(params.id)))),
  http.post(u('/deliveries/:id/complete'), ({ params }) => run(() => mock.complete(String(params.id)))),
  http.post(u('/deliveries/:id/cancel'), ({ params }) => run(() => mock.cancel(String(params.id)))),
  http.post(u('/deliveries/:id/fail'), ({ request, params }) => withBody<{ reason?: string }>(request, (b) => mock.fail(String(params.id), b.reason))),
  http.post(u('/deliveries/:id/stops/:stopId/arrive'), ({ params }) => run(() => mock.advanceStop(String(params.id), String(params.stopId), 'arrive'))),
  http.post(u('/deliveries/:id/stops/:stopId/complete'), ({ params }) => run(() => mock.advanceStop(String(params.id), String(params.stopId), 'complete'))),

  http.get(u('/supervisor/actions'), () => run(() => [])),
  http.get(u('/proposals'), ({ request }) => run(() => mock.proposals(new URL(request.url).searchParams.get('status')))),
  http.post(u('/proposals'), ({ request }) => withBody<Parameters<typeof mock.createProposal>[0]>(request, (b) => mock.createProposal(b), 201)),
  http.post(u('/proposals/:id/approve'), ({ params }) => run(() => mock.approveProposal(String(params.id)))),
  http.post(u('/proposals/:id/reject'), ({ params }) => run(() => mock.rejectProposal(String(params.id)))),
];
