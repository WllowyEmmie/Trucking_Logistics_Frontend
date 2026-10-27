import type { CSSProperties } from 'react';
import { STATUS_LABEL } from '@/lib/labels';
import type { PillStatus } from '@/lib/types';

// The only status representation. No other component colours a status.

const VAR: Record<PillStatus, string> = {
  pending: '--status-pending',
  assigned: '--status-assigned',
  in_transit: '--status-transit',
  completed: '--status-completed',
  cancelled: '--status-cancelled',
  failed: '--status-failed',
  available: '--truck-available',
  on_delivery: '--truck-busy',
  maintenance: '--truck-maintenance',
  offline: '--truck-offline',
};

const HOLLOW = new Set<PillStatus>(['pending', 'cancelled', 'maintenance', 'offline']);

// height / font / padding-inline / dot / gap
const SIZE = {
  sm: [22, 12, 8, 8, 5],
  md: [26, 13, 10, 9, 6],
  lg: [34, 16, 14, 11, 8],
} as const;

export interface StatusPillProps {
  status: PillStatus;
  size?: keyof typeof SIZE;
  /** Override, e.g. "Arrived 14:06". */
  label?: string;
}

export function StatusPill({ status, size = 'md', label }: StatusPillProps) {
  const v = VAR[status];
  const [h, fs, px, , gap] = SIZE[size];
  const hollow = HOLLOW.has(status);
  const fg = `var(${v})`;
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap,
    height: h,
    paddingInline: px,
    borderRadius: 7,
    border: `1px ${hollow ? 'dashed' : 'solid'} color-mix(in srgb, ${fg} ${hollow ? 55 : 35}%, transparent)`,
    background: `var(${v}-bg)`,
    color: fg,
    fontFamily: 'var(--font-sans)',
    fontSize: fs,
    fontWeight: 500,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    flex: 'none',
  };
  return (
    <span style={style}>
      {/* The badge's look from the design: tinted fill and edge, no dot. Hollow statuses (nothing
          moving) keep a dashed edge so they don't read as the coloured ones. */}
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}
