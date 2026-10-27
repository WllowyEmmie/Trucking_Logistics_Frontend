// Shared bits for the Fleet add forms.

/** Plates match with spaces, hyphens and dots ignored: "kf 03" is KF-03. */
export const normPlate = (s: string) => s.replace(/[\s\-.]/g, '').toUpperCase();

/** Phone digits with a leading +, for duplicate checks and validation. */
export const normPhone = (s: string) => s.replace(/[^\d+]/g, '');

/**
 * POST /drivers body from the form, or the field errors. The phone is sent normalised: the API's
 * duplicate check is an exact match, so "+44 7700 900123" and "+447700900123" would otherwise both
 * be accepted as different drivers.
 */
export function driverRequest(
  name: string,
  phone: string,
  pin = '',
):
  | { ok: true; body: { name: string; phone: string; pin?: string } }
  | { ok: false; errs: { name?: string; phone?: string; pin?: string } } {
  const errs: { name?: string; phone?: string; pin?: string } = {};
  const ph = normPhone(phone);
  if (!name.trim()) errs.name = "Enter the driver's name";
  if (!ph) errs.phone = 'Enter a mobile number';
  else if (!/^\+\d{7,15}$/.test(ph)) errs.phone = 'Start with + and the country code, then the number';
  const pinErr = pinProblem(pin);
  if (pin && pinErr) errs.pin = pinErr;
  if (Object.keys(errs).length) return { ok: false, errs };
  return { ok: true, body: { name: name.trim(), phone: ph, ...(pin ? { pin } : {}) } };
}

/** Why a PIN would be refused, or null. The API takes 4 to 8 digits; 6 is much harder to guess. */
export function pinProblem(pin: string): string | null {
  if (!/^\d+$/.test(pin)) return 'Digits only';
  if (pin.length < 4 || pin.length > 8) return '4 to 8 digits';
  return null;
}

export const fieldCls = (err?: boolean, mono?: boolean) =>
  `min-h-11 rounded-md bg-surface-100 px-3 text-[15px] text-ink ${mono ? 'font-mono' : ''} ${
    err ? 'border-2 border-attention' : 'border border-border'
  }`;

export const hintCls = (err?: boolean) => `t-body-sm ${err ? 'font-semibold text-attention' : 'text-ink-muted'}`;

export const radioCls = (on: boolean) =>
  `min-h-11 rounded-[10px] px-3.5 text-[13.5px] font-medium ${
    on ? 'border border-brand bg-brand text-brand-ink' : 'border border-border bg-surface-100 text-ink'
  }`;

export const submitCls = 'min-h-12 rounded-[14px] border-0 bg-ink text-[14px] font-medium text-surface-100 hover:opacity-90 disabled:opacity-45';
// Inside the Fleet panel, which has its own title and edge.
export const formCls = 'flex flex-col gap-4 bg-surface-100 p-4';
