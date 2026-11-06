/** Pre-orders can be changed only up to this long before the reservation starts (backend rule). */
export const PRE_ORDER_CUTOFF_MS = 30 * 60_000;

/** Safety margin used when picking a reservation for a new pre-order, so it does not close while the guest is choosing. */
export const PRE_ORDER_LEAD_MS = PRE_ORDER_CUTOFF_MS + 60_000;

/** True when the reservation starts in less than 30 minutes (or already started). Unknown start → not closed. */
export function isPreOrderClosed(startTime: Date | string | null | undefined, now: number = Date.now()): boolean {
  const start = startTime ? new Date(startTime).getTime() : Number.NaN;
  return !Number.isNaN(start) && start - now < PRE_ORDER_CUTOFF_MS;
}
