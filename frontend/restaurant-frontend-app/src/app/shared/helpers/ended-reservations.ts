/** Minimal reservation shape needed to tell whether a table is already over. */
export interface ReservationEnd {
  id: string;
  endTime: Date | string;
}

/** Ids of reservations whose end time has passed: the cart no longer shows their tables or dishes. */
export function endedReservationIds(reservations: ReservationEnd[], now: number = Date.now()): Set<string> {
  return new Set(
    reservations
      .filter((reservation) => {
        const end = new Date(reservation.endTime).getTime();
        return !Number.isNaN(end) && end <= now;
      })
      .map((reservation) => reservation.id),
  );
}
