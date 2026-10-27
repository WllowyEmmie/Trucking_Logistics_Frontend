'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, post } from './api';
import type { Message, MessageThread, ThreadResponse } from './types';
import { MY_THREAD_KEY, driverSocketLive, useDriverSocket } from './driverSocket';

// Messages between dispatch and drivers (Go: internal/api/messages.go). The console refetches when
// the socket says topic "messages" changed (lib/positions.ts) and polls as a backstop; the driver's
// phone gets each message on its own socket (lib/driverSocket.ts) and polls slowly as a backstop.

export const MESSAGES_KEY = ['messages'] as const;
const threadsKey = [...MESSAGES_KEY, 'threads'] as const;
const threadKey = (driverId: string) => [...MESSAGES_KEY, 'thread', driverId] as const;
const myKey = MY_THREAD_KEY;

export function useThreads() {
  return useQuery({ queryKey: threadsKey, queryFn: () => api<MessageThread[]>('/messages'), refetchInterval: 30_000 });
}

/** The console's unread count: driver messages nobody in dispatch has opened. */
export function useUnreadMessages(): number {
  return (useThreads().data ?? []).reduce((n, t) => n + t.unread, 0);
}

export function useThread(driverId: string | null) {
  return useQuery({
    queryKey: threadKey(driverId ?? ''),
    queryFn: () => api<ThreadResponse>(`/drivers/${encodeURIComponent(driverId!)}/messages`),
    enabled: !!driverId,
    refetchInterval: 20_000,
  });
}

export function useSendToDriver(driverId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => post<Message>(`/drivers/${encodeURIComponent(driverId!)}/messages`, { body }),
    onSuccess: (m) => {
      qc.setQueryData<ThreadResponse>(threadKey(m.driver_id), (t) => (t ? { ...t, messages: [...t.messages, m] } : t));
      void qc.invalidateQueries({ queryKey: MESSAGES_KEY });
    },
  });
}

export async function markDriverThreadRead(driverId: string) {
  await post(`/drivers/${encodeURIComponent(driverId)}/messages/read`).catch(() => undefined);
}

// ---- The driver's side ----

export function useMyThread(enabled = true) {
  useDriverSocket(enabled);
  return useQuery({
    queryKey: myKey,
    queryFn: () => api<ThreadResponse>('/auth/me/messages'),
    // Every 20 s without the socket, every 2 min with it (it only misses what a dropped frame loses).
    refetchInterval: () => (driverSocketLive() ? 120_000 : 20_000),
    enabled,
  });
}

export function useSendToDispatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => post<Message>('/auth/me/messages', { body }),
    onSuccess: (m) => {
      // The socket may have delivered it first (this driver's other phones get it too).
      qc.setQueryData<ThreadResponse>(myKey, (t) =>
        t && !t.messages.some((x) => x.id === m.id) ? { ...t, messages: [...t.messages, m] } : t,
      );
    },
  });
}

export async function markMyThreadRead() {
  await post('/auth/me/messages/read').catch(() => undefined);
}
