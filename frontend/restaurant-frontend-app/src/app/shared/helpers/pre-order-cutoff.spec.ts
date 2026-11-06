import { isPreOrderClosed, PRE_ORDER_CUTOFF_MS } from './pre-order-cutoff';

describe('isPreOrderClosed', () => {
  const now = Date.parse('2026-11-06T16:00:00Z');

  it('is open when the reservation starts more than 30 minutes later', () => {
    expect(isPreOrderClosed(new Date(now + PRE_ORDER_CUTOFF_MS + 1), now)).toBeFalse();
  });

  it('closes exactly inside the 30-minute window and for past reservations', () => {
    expect(isPreOrderClosed(new Date(now + PRE_ORDER_CUTOFF_MS - 1), now)).toBeTrue();
    expect(isPreOrderClosed('2026-11-02T08:00:00Z', now)).toBeTrue();
  });

  it('treats a missing or invalid start time as open', () => {
    expect(isPreOrderClosed(undefined, now)).toBeFalse();
    expect(isPreOrderClosed('not a date', now)).toBeFalse();
  });
});
