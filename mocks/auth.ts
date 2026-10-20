// Sign-in for mock mode. Any email and password sign in as a dispatcher; a mock driver's phone
// with their PIN (1234 unless changed in Fleet) signs in as that driver. Kept in localStorage so a
// reload stays signed in, the way the real cookie does. Not a security boundary: mock mode only.
import { mock } from './data';
import type { Me } from '@/lib/auth';

const SESSION = 'mock-session';
const PINS = 'mock-pins';
const DEFAULT_PIN = '1234';

type Session = { role: 'dispatcher'; email: string } | { role: 'driver'; id: string };

const read = <T,>(k: string, fallback: T): T => {
  try {
    const s = localStorage.getItem(k);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (k: string, v: unknown) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // Storage blocked: the session lasts until reload.
  }
};

const norm = (p: string) => p.replace(/[^\d+]/g, '');
const pinOf = (id: string) => read<Record<string, string>>(PINS, {})[id] ?? DEFAULT_PIN;

export const mockAuth = {
  me(): Me | null {
    const s = read<Session | null>(SESSION, null);
    if (!s) return null;
    if (s.role === 'dispatcher') return { role: 'dispatcher', name: 'Mock Dispatcher', email: s.email };
    const d = mock.drivers().find((x) => x.id === s.id);
    if (!d) return null;
    const truck = mock.trucks().find((t) => t.driver_id === d.id);
    return { role: 'driver', id: d.id, name: d.name, ...(truck ? { truck_id: truck.id } : {}) };
  },
  login(email: string, password: string): Me | null {
    if (!email.trim() || !password) return null;
    write(SESSION, { role: 'dispatcher', email: email.trim().toLowerCase() });
    return this.me();
  },
  driverLogin(phone: string, pin: string): Me | null {
    const d = mock.drivers().find((x) => norm(x.phone) === norm(phone));
    if (!d || pin !== pinOf(d.id)) return null;
    write(SESSION, { role: 'driver', id: d.id });
    return this.me();
  },
  logout() {
    write(SESSION, null);
  },
  setPin(id: string, pin: string) {
    write(PINS, { ...read<Record<string, string>>(PINS, {}), [id]: pin });
    const s = read<Session | null>(SESSION, null);
    if (s?.role === 'driver' && s.id === id) write(SESSION, null);
  },
};
