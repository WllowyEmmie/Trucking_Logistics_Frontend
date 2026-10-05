'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Config } from './types';

// TODO(config): confirm the GET /config and PUT /config shapes with the backend.
// Until then, anything missing from the response falls back to these.
export const DEFAULT_CONFIG: Config = {
  operator_name: 'Kestrel Freight',
  support_phone: '+44 113 496 0321',
  dispatch_phone: '+44 113 496 0300',
  locale: 'en-GB',
  timezone: 'Europe/London',
  units: 'km',
  mass_unit: 'kg',
  map_center: { lat: 53.683, lng: -1.505 },
  service_radius: 60,
  stale_minutes: 20,
  pending_minutes: 120,
  failed_window_minutes: 60,
  ping_seconds: 15,
  agent_enabled: true,
};

export const CONFIG_KEY = ['config'] as const;

/** The backend reads its config at startup, so fetch it once and keep it. */
export function useConfig(): Config {
  const { data } = useQuery({
    queryKey: CONFIG_KEY,
    queryFn: async () => ({ ...DEFAULT_CONFIG, ...(await api<Partial<Config>>('/config')) }),
    staleTime: Infinity,
    retry: 1,
  });
  return data ?? DEFAULT_CONFIG;
}

export const isRtlLocale = (locale: string) => /^(ar|he|fa|ur)\b/i.test(locale);
