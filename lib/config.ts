'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { THRESHOLDS, type Config } from './types';

// GET /config serves every operator setting: region, map and service area, organisation, the
// agent switch and the alert thresholds. Dispatchers change them on the Settings page (PUT
// /config); they're stored in the database and take effect without a restart.

/** Until GET /config answers (or for an older API that serves fewer fields). */
export const SERVER_DEFAULTS: Config = {
  country: '',
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
  operator_name: 'Dispatch',
  support_phone: '',
  dispatch_phone: '',
  depot: null,
  agent_enabled: true,
  ...THRESHOLDS,
  eta_speed_kph: 25,
  stop_minutes: 10,
  board_hours: 12,
  pod_photo_required: false,
  pod_signature_required: true,
  customer_terms: '',
  customer_faq: [],
  auto_assign: false,
  auto_radius_km: 2,
  updated_at: null,
};

/** Config plus three conveniences. */
export interface AppConfig extends Config {
  /** = language, for Intl. */
  locale: string;
  center: { lat: number; lng: number };
  /** False when the bounding box is the whole world (no service area configured). */
  hasServiceArea: boolean;
}

export const isWholeWorld = (c: Pick<Config, 'min_lat' | 'max_lat' | 'min_lng' | 'max_lng'>) =>
  c.min_lat <= -90 && c.max_lat >= 90 && c.min_lng <= -180 && c.max_lng >= 180;

export function toAppConfig(raw: Partial<Config>): AppConfig {
  const c: Config = { ...SERVER_DEFAULTS, ...raw };
  return {
    ...c,
    locale: c.language || 'en',
    center: { lat: c.center_lat, lng: c.center_lng },
    hasServiceArea: !isWholeWorld(c),
  };
}

export const CONFIG_KEY = ['config'] as const;

/** Refetched every few minutes and on focus, so a save in another tab shows up here too. */
export function useConfig(): AppConfig {
  const { data } = useQuery({
    queryKey: CONFIG_KEY,
    queryFn: async () => toAppConfig(await api<Partial<Config>>('/config')),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  return data ?? DEFAULT_APP_CONFIG;
}

export const DEFAULT_APP_CONFIG = toAppConfig(SERVER_DEFAULTS);

/** Inside the service-area bounding box: the backend rejects stops and pings outside it. */
export const inServiceArea = (c: Pick<Config, 'min_lat' | 'max_lat' | 'min_lng' | 'max_lng'>, p: { lat: number; lng: number }) =>
  p.lat >= c.min_lat && p.lat <= c.max_lat && p.lng >= c.min_lng && p.lng <= c.max_lng;

export const isRtlLocale = (locale: string) => /^(ar|he|fa|ur)\b/i.test(locale);
