/**
 * Short table name ("Table 4") taken from a reservation label such as
 * "48 Rustaveli Ave, Table table-4, Sat Nov 01 2026" or "48 Rustaveli Ave, Table 4 • Nov 1, 2026".
 */
export function tableShortLabel(label: string | null | undefined): string | null {
  const match = label?.match(/Table\s+(?:table-)?([\w-]+)/i);

  return match ? `Table ${match[1]}` : null;
}
