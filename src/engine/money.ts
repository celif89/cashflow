/** Kwoty liczymy w groszach, żeby 0,1 + 0,2 dawało 0,30 zł. */
export const toGr = (v: number) => Math.round(v * 100);
export const fromGr = (g: number) => g / 100;
export const round2 = (v: number) => fromGr(toGr(v));
export const sum = (xs: number[]) => fromGr(xs.reduce((a, x) => a + toGr(x), 0));

/** „12,50”, „12.5”, „1 234,99 zł” → 12.5 / 1234.99; nie-liczba → null. */
export function parseAmount(raw: string): number | null {
  const s = raw.replace(/\s|zł|pln/gi, "").replace(",", ".");
  if (!/^-?\d+(\.\d{0,2})?$/.test(s)) return null;
  return round2(Number(s));
}
