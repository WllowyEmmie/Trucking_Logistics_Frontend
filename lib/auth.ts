'use client';

import { useQuery, type QueryClient } from '@tanstack/react-query';
import { ApiError, api, post } from './api';

/** GET /auth/me: who this browser is signed in as. */
export interface Me {
  role: 'dispatcher' | 'driver' | 'agent';
  id?: string;
  name: string;
  email?: string;
  /** Drivers: the truck this phone reports for. Missing when no truck has them as its driver. */
  truck_id?: string;
  /** Drivers: on shift (GPS runs only then), and since when. */
  on_shift?: boolean;
  shift_since?: string | null;
}

export const ME_KEY = ['me'] as const;

/** Null when not signed in. A network failure throws, so a gate can tell "signed out" from "offline". */
export async function fetchMe(): Promise<Me | null> {
  try {
    return await api<Me>('/auth/me');
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export function useMe() {
  return useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: 5 * 60_000, retry: 1 });
}

/** The session is an HttpOnly cookie set by the API: this page never sees the token. */
export const signIn = (email: string, password: string) => post<Me>('/auth/login', { email, password });
export const driverSignIn = (phone: string, pin: string) => post<Me>('/auth/driver-login', { phone, pin });

export async function signOut(qc: QueryClient) {
  await post('/auth/logout').catch(() => undefined);
  // Nothing from the last person may stay on screen for the next.
  qc.clear();
  qc.setQueryData(ME_KEY, null);
}
