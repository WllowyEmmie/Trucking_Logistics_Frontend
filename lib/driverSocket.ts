'use client';

import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, API_URL } from './api';
import { ME_KEY } from './auth';
import type { Message, ThreadResponse } from './types';

// The driver's live thread: GET /ws/driver (Go: internal/api/ws.go, driverSocket). The API sends
// {"type":"message","message":{…}} the moment dispatch writes to this driver (or the driver writes
// from another phone), so the chat shows it without waiting for a poll. One socket per tab, shared
// by every screen that shows the thread; polling in lib/messages.ts is only the backstop.
//
// Same routing as the console's socket (lib/positions.ts): through Next's /api rewrite by default,
// or straight at the API when NEXT_PUBLIC_WS_URL is set, with a one-minute pass from /ws/ticket.

export const MY_THREAD_KEY = ['messages', 'me'] as const;

type Frame = { type: 'hello' } | { type: 'message'; message: Message };

let socket: WebSocket | null = null;
let users = 0;
let fetchingPass = false;
let retry: ReturnType<typeof setTimeout> | null = null;
let backoff = 1000;
let live = false;

/** Whether the driver socket is up (lib/messages.ts polls less while it is). */
export const driverSocketLive = () => live;

function socketUrl(): string | null {
  const env = process.env.NEXT_PUBLIC_WS_URL;
  if (env) return env.replace(/\/ws\/?$/, '') + '/ws/driver';
  const url = new URL(`${API_URL}/ws/driver`, window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function onFrame(qc: QueryClient, raw: unknown) {
  let f: Frame;
  try {
    f = JSON.parse(String(raw)) as Frame;
  } catch {
    return;
  }
  if (f.type === 'hello') {
    // (Re)connected: anything sent while the socket was down comes from a refetch.
    void qc.invalidateQueries({ queryKey: MY_THREAD_KEY });
  } else if (f.type === 'message' && f.message) {
    const m = f.message;
    qc.setQueryData<ThreadResponse>(MY_THREAD_KEY, (t) => {
      if (!t || t.messages.some((x) => x.id === m.id)) return t;
      return { messages: [...t.messages, m], unread: t.unread + (m.from_driver ? 0 : 1) };
    });
  }
}

function schedule(qc: QueryClient) {
  if (retry || users === 0) return;
  retry = setTimeout(() => {
    retry = null;
    connect(qc);
  }, backoff);
  backoff = Math.min(backoff * 2, 30_000);
}

function open(qc: QueryClient, url: string) {
  const ws = new WebSocket(url);
  socket = ws;
  let opened = false;
  ws.onopen = () => {
    opened = true;
    live = true;
    backoff = 1000;
  };
  ws.onmessage = (e) => onFrame(qc, e.data);
  ws.onclose = () => {
    if (socket === ws) socket = null;
    live = false;
    // Refused before it opened: most often the sign-in is gone. Rechecking "me" sends the driver
    // back to sign-in if so, which unmounts this and stops the retries.
    if (!opened) void qc.invalidateQueries({ queryKey: ME_KEY });
    schedule(qc);
  };
}

function connect(qc: QueryClient) {
  if (socket || fetchingPass || users === 0) return;
  const url = socketUrl();
  if (!url) return;
  if (!process.env.NEXT_PUBLIC_WS_URL) return open(qc, url);
  fetchingPass = true;
  api<{ ticket: string }>('/ws/ticket').then(
    ({ ticket }) => {
      fetchingPass = false;
      if (socket || users === 0) return;
      const u = new URL(url);
      u.searchParams.set('ticket', ticket);
      open(qc, u.toString());
    },
    () => {
      fetchingPass = false;
      schedule(qc);
    },
  );
}

function release() {
  users -= 1;
  if (users > 0) return;
  if (retry) clearTimeout(retry);
  retry = null;
  const ws = socket;
  socket = null;
  live = false;
  ws?.close();
}

/** Keeps the driver's socket open while a screen that shows the thread is mounted. */
export function useDriverSocket(enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    // Mock mode has no driver socket (MSW only serves /ws); polling covers it.
    if (!enabled || process.env.NEXT_PUBLIC_API_MOCKING === 'enabled') return;
    users += 1;
    connect(qc);
    return release;
  }, [enabled, qc]);
}
