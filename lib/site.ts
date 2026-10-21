// The public website's contact details. Set them on Vercel (or in .env.local) without touching code:
// NEXT_PUBLIC_SITE_NAME, NEXT_PUBLIC_CONTACT_EMAIL, NEXT_PUBLIC_CONTACT_PHONE. They're built into the
// page, so redeploy after changing one. The phone default is a placeholder, not a real line.

import { useConfig } from './config';

export interface SiteContact {
  name: string;
  email: string;
  /** E.164, e.g. +2348000000000. */
  phone: string;
}

const ENV_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? '';
const ENV_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'emituntunbello@gmail.com';
const ENV_PHONE = process.env.NEXT_PUBLIC_CONTACT_PHONE ?? '+2348000000000';

/** The environment's values first, then Settings. */
export function useSite(): SiteContact {
  const c = useConfig();
  return {
    name: ENV_NAME || c.operator_name,
    email: ENV_EMAIL || c.dispatch_email,
    phone: ENV_PHONE || c.support_phone,
  };
}

/** +2348000000000 → +234 800 000 0000 */
export function prettyPhone(e164: string): string {
  const m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+234 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

/** The public pages: always light, whatever the console's theme. */
export const isPublicPath = (path: string | null) =>
  path === '/' || path === '/terms' || (path?.startsWith('/book') ?? false);
