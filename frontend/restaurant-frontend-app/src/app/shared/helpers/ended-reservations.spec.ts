import { endedReservationIds } from './ended-reservations';

describe('endedReservationIds', () => {
  const now = Date.parse('2026-11-06T16:00:00Z');

  it('returns reservations that ended before or exactly at now', () => {
    const ids = endedReservationIds(
      [
        { id: 'past', endTime: '2026-11-02T09:30:00Z' },
        { id: 'edge', endTime: '2026-11-06T16:00:00Z' },
        { id: 'running', endTime: '2026-11-06T16:30:00Z' },
        { id: 'future', endTime: new Date('2026-11-07T18:30:00Z') },
      ],
      now,
    );

    expect([...ids]).toEqual(['past', 'edge']);
  });

  it('ignores reservations without a valid end time', () => {
    expect(endedReservationIds([{ id: 'broken', endTime: 'not a date' }], now).size).toBe(0);
  });

  it('returns an empty set for no reservations', () => {
    expect(endedReservationIds([], now).size).toBe(0);
  });
});
