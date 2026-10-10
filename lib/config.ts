'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { THRESHOLDS, type Config } from './types';

// GET /config serves units, timezone, language, the map centre and the service-area bounding box.
// The backend reads it from its environment at startup and has no write path.
//
// Everything else the screens need is client-side until the API serves it. TODO(config):
// operator name and phones, the agent switch and the depot come from NEXT_PUBLIC_* env vars;
// the exception thresholds are THRESHOLDS in lib/types.ts (TODO(config-thresholds)).

const env = (v: string | undefined, fallback: string) => (v && v.trim() ? v.trim() : fallback);
const num = (v: string | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : null);

/** Until GET /config answers: the backend's own defaults (UTC, metric, "en", whole world). */
export const SERVER_DEFAULTS: Config = {
  units: 'metric',
  timezone: 'UTC',
  language: 'en',
  center_lat: 0,
  center_lng: 0,
  default_zoom: 11,
  min_lat: -90,
  max_lat: 90,
  min_lng: -180,
  max_lng: 180,
};

const depotLat = num(process.env.NEXT_PUBLIC_DEPOT_LAT);
const depotLng = num(process.env.NEXT_PUBLIC_DEPOT_LNG);

export const CLIENT_CONFIG = {
  operator_name: env(process.env.NEXT_PUBLIC_OPERATOR_NAME, 'Dispatch'),
  support_phone: env(process.env.NEXT_PUBLIC_SUPPORT_PHONE, ''),
  dispatch_phone: env(process.env.NEXT_PUBLIC_DISPATCH_PHONE, ''),
  agent_enabled: process.env.NEXT_PUBLIC_AGENT_ENABLED !== 'false',
  /** Pre-fills the pickup of a new delivery. Config has no depot field. */
  depot:
    process.env.NEXT_PUBLIC_DEPOT_ADDRESS && depotLat != null && depotLng != null
      ? { address: process.env.NEXT_PUBLIC_DEPOT_ADDRESS, lat: depotLat, lng: depotLng }
      : null,
};

/** Server config, client-side settings and thresholds, plus two conveniences. */
export interface AppConfig extends Config {
  operator_name: string;
  support_phone: string;
  dispatch_phone: string;
  agent_enabled: boolean;
  depot: { address: string; lat: number; lng: number } | null;
  stale_minutes: number;
  pending_minutes: number;
  failed_window_minutes: number;
  ping_seconds: number;
  /** = language, for Intl. */
  locale: string;
  center: { lat: number; lng: number };
  /** False when the bounding box is the whole world (no service area configured). */
  hasServiceArea: boolean;
}

export function toAppConfig(c: Config): AppConfig {
  return {
    ...c,
    ...CLIENT_CONFIG,
    ...THRESHOLDS,
    locale: c.language || 'en',
    center: { lat: c.center_lat, lng: c.center_lng },
    hasServiceArea: !(c.min_lat <= -90 && c.max_lat >= 90 && c.min_lng <= -180 && c.max_lng >= 180),
  };
}

export const CONFIG_KEY = ['config'] as const;

/** Fetched once and kept: the backend only reads it at startup. */
export function useConfig(): AppConfig {
  const { data } = useQuery({
    queryKey: CONFIG_KEY,
    queryFn: async () => toAppConfig({ ...SERVER_DEFAULTS, ...(await api<Partial<Config>>('/config')) }),
    staleTime: Infinity,
    retry: 1,
  });
  return data ?? DEFAULT_APP_CONFIG;
}

export const DEFAULT_APP_CONFIG = toAppConfig(SERVER_DEFAULTS);

/** Inside the service-area bounding box: the backend rejects stops and pings outside it. */
export const inServiceArea = (c: Config, p: { lat: number; lng: number }) =>
  p.lat >= c.min_lat && p.lat <= c.max_lat && p.lng >= c.min_lng && p.lng <= c.max_lng;

export const isRtlLocale = (locale: string) => /^(ar|he|fa|ur)\b/i.test(locale);
