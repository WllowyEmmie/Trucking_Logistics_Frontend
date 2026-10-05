// Shared bits for the Fleet add forms.

/** Plates match with spaces, hyphens and dots ignored: "kf 03" is KF-03. */
export const normPlate = (s: string) => s.replace(/[\s\-.]/g, '').toUpperCase();

/** Phone digits with a leading +, for duplicate checks and validation. */
export const normPhone = (s: string) => s.replace(/[^\d+]/g, '');

export const fieldCls = (err?: boolean, mono?: boolean) =>
  `min-h-11 rounded-md bg-surface-100 px-3 text-[15px] text-ink ${mono ? 'font-mono' : ''} ${
    err ? 'border-2 border-attention' : 'border border-border'
  }`;

export const hintCls = (err?: boolean) => `t-body-sm ${err ? 'font-semibold text-attention' : 'text-ink-muted'}`;

export const radioCls = (on: boolean) =>
  `min-h-11 rounded-full px-3.5 text-[14px] font-semibold ${
    on ? 'border-2 border-ink bg-ink text-surface-100' : 'border border-border bg-surface-100 text-ink'
  }`;

export const submitCls = 'min-h-12 rounded-md border-0 bg-ink text-[15px] font-bold text-surface-100 disabled:opacity-45';
export const formCls = 'flex flex-col gap-4 rounded-lg border-2 border-ink bg-surface-100 p-5';
