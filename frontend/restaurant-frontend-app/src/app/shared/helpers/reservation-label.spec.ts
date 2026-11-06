import { tableShortLabel } from './reservation-label';

describe('tableShortLabel', () => {
  it('reads the table from the label built on the reservations page', () => {
    expect(tableShortLabel('48 Rustaveli Ave, Table table-4, Sat Nov 01 2026, 7:00 PM')).toBe('Table 4');
  });

  it('reads the table from the label built in the cart', () => {
    expect(tableShortLabel('48 Rustaveli Ave, Table 12 • Nov 1, 2026, 7:00 PM')).toBe('Table 12');
  });

  it('returns null when the label has no table', () => {
    expect(tableShortLabel('48 Rustaveli Ave')).toBeNull();
    expect(tableShortLabel(undefined)).toBeNull();
  });
});
