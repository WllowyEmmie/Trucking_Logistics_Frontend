// Shared class strings for the dispatcher screens. Values all come from tokens.

/** Filter chip / pill toggle: active = the brand yellow, like the design's segmented tabs. */
export const chipCls = (on: boolean) =>
  `inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-semibold ${
    on ? 'border border-brand bg-brand text-brand-ink' : 'border border-border bg-surface-100 text-ink hover:border-ink-subtle'
  }`;

/** Segmented tab / option button with 8px radius. */
export const tabCls = (on: boolean) =>
  `min-h-11 rounded-md px-3.5 text-[14px] font-semibold ${
    on ? 'border border-brand bg-brand text-brand-ink' : 'border border-border bg-surface-100 text-ink hover:border-ink-subtle'
  }`;

export const btnPrimary = 'min-h-11 rounded-md border-0 bg-ink px-3.5 text-[13px] font-semibold text-surface-100 disabled:opacity-45';
export const btnSecondary = 'min-h-11 rounded-md border border-border bg-surface-100 px-3 text-[13px] font-semibold text-ink disabled:opacity-45';

export const inputCls = (err?: boolean) =>
  `min-h-11 rounded-md bg-surface-100 px-2.5 text-[14px] text-ink ${err ? 'border-2 border-attention' : 'border border-border'}`;

export const textareaCls = (err?: boolean) =>
  `rounded-md bg-surface-100 px-2.5 py-2 text-[14px] leading-5 text-ink resize-y ${err ? 'border-2 border-attention' : 'border border-border'}`;
