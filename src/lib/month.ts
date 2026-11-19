// Wybrany miesiąc zapamiętany w adresie (?m=2026-11), wspólny dla pulpitu i listy.
import { useSearchParams } from "react-router-dom";
import { thisMonth } from "../engine/dates";

export function useMonthParam(): [string, (m: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("m");
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : thisMonth();
  const set = (m: string) => {
    const next = new URLSearchParams(params);
    if (m === thisMonth()) next.delete("m");
    else next.set("m", m);
    setParams(next, { replace: true });
  };
  return [month, set];
}
