import type { FailReason, PillStatus } from './types';

export const STATUS_LABEL: Record<PillStatus, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  in_transit: 'In transit',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
  available: 'Available',
  on_delivery: 'On delivery',
  maintenance: 'Maintenance',
  offline: 'Offline',
};

export const FAIL_REASONS: { key: FailReason; label: string }[] = [
  { key: 'breakdown', label: 'Breakdown' },
  { key: 'customer_unavailable', label: 'Customer unavailable' },
  { key: 'goods_damaged', label: 'Goods damaged' },
  { key: 'accident', label: 'Accident' },
  { key: 'other', label: 'Other' },
];

export const failReasonLabel = (r: FailReason | null): string =>
  FAIL_REASONS.find((x) => x.key === r)?.label.toLowerCase() ?? 'reason not given';
