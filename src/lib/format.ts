import { parseDay } from "../engine/dates";

export const MONTHS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień",
  "październik", "listopad", "grudzień"];
const MONTHS_GENITIVE = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia",
  "września", "października", "listopada", "grudnia"];
const MONTHS_SHORT = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
const WEEKDAYS = ["poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota", "niedziela"];

const pln = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plnRound = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 });

/** „1 234,50 zł” (twarda spacja, żeby kwota się nie łamała) */
export const money = (v: number) => `${pln.format(v)} zł`.replace(/\s(?=\d)/g, " ");
/** „1 235 zł” – na osie wykresów i kafelki */
export const moneyRound = (v: number) => `${plnRound.format(v)} zł`.replace(/\s(?=\d)/g, " ");
export const signedMoney = (v: number, kind: "expense" | "income") => `${kind === "expense" ? "−" : "+"}${money(v)}`;
/** „1,2 tys.” – krótko na osi */
export const axisMoney = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pl-PL", { maximumFractionDigits: 1 })}\u00a0tys.` : plnRound.format(v));
export const percent = (v: number) => `${Math.round(v * 100)}%`;

export function monthName(month: string, short = false): string {
  const [y, m] = month.split("-");
  return `${(short ? MONTHS_SHORT : MONTHS)[Number(m) - 1]} ${y}`;
}
export const monthShort = (month: string) => MONTHS_SHORT[Number(month.slice(5, 7)) - 1];

export function dayLabel(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}.${m}.${y}`;
}

/** „pt, 31 października” */
export function dayLong(day: string, withYear = false): string {
  const d = parseDay(day);
  return `${WEEKDAYS[(d.getDay() + 6) % 7]}, ${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ""}`;
}

/** „1 transakcja”, „2 transakcje”, „5 transakcji” */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10, mod100 = n % 100;
  const word = n === 1 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
  return `${n} ${word}`;
}
export const txCount = (n: number) => plural(n, "transakcja", "transakcje", "transakcji");
