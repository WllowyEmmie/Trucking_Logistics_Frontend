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
  /** Drivers still on the default PIN (1234): the app asks for their own before anything else. */
  must_change_pin?: boolean;
}

/** POST /auth/me/pin: the driver chooses their PIN. Returns who they are, now on shift. */
export const changeMyPin = (pin: string) => post<Me>('/auth/me/pin', { pin });

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
  // Always rechecked when a gate mounts: the console and the driver app sign in separately, so who
  // "me" is depends on which one this tab just moved to.
  return useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: 5 * 60_000, retry: 1, refetchOnMount: 'always' });
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
