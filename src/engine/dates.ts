const pad = (n: number) => String(n).padStart(2, "0");

export const toDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toDay(new Date());
export const monthOf = (day: string) => day.slice(0, 7);
export const thisMonth = () => monthOf(today());

export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "2026-11" + n miesięcy → "2027-01" */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** Ostatnie `count` miesięcy kończąc na `last` (rosnąco). */
export function monthRange(last: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(last, i - count + 1));
}

export const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseDay(s).getTime());
