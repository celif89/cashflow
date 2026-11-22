// Wykresy (Recharts). Zasady: jedna oś Y, cienkie słupki z zaokrąglonym końcem, dyskretna siatka,
// podpowiedź po najechaniu/dotknięciu, legenda przy co najmniej dwóch seriach.
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useEffect, useState } from "react";

/** Kolory serii – jasny / ciemny motyw (sprawdzone pod kątem daltonizmu, ustalona kolejność). */
const LIGHT = { s1: "#2a78d6", s2: "#eb6834", s3: "#1baf7a", muted: "#94a3b8", tick: "#64748b", grid: "rgba(148,163,184,0.25)", surface: "#ffffff" };
const DARK = { s1: "#3987e5", s2: "#d95926", s3: "#199e70", muted: "#64748b", tick: "#94a3b8", grid: "rgba(148,163,184,0.14)", surface: "#0c1229" };

export function usePalette() {
  const q = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const [dark, setDark] = useState(q?.matches ?? false);
  useEffect(() => {
    if (!q) return;
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, [q]);
  return dark ? DARK : LIGHT;
}

type Fmt = (v: number) => string;
interface Series { key: string; name: string; color: string; dashed?: boolean }

function TooltipBox({ active, payload, label, fmt, labelFmt }: {
  active?: boolean; payload?: { name: string; value: number | null; color: string; stroke?: string }[]; label?: string | number;
  fmt: Fmt; labelFmt?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value !== null && p.value !== undefined);
  if (!rows.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:border-white/10 dark:bg-ink-800/95">
      <div className="mb-1 font-medium text-slate-700 dark:text-slate-200">{labelFmt ? labelFmt(String(label)) : label}</div>
      {rows.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <span className="size-2 rounded-full" style={{ background: p.stroke || p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-semibold tnum text-slate-900 dark:text-slate-100">{fmt(p.value!)}</span>
        </div>
      ))}
    </div>
  );
}

const legend = (
  <Legend verticalAlign="top" align="left" height={30} iconType="circle" iconSize={8} itemSorter={null}
    formatter={(v: string) => <span className="text-xs text-slate-500 dark:text-slate-400">{v}</span>} />
);

export function Bars({ data, x, series, fmt, axisFmt, labelFmt, height = 240, onPick, highlight }: {
  data: object[]; x: string; series: Series[]; fmt: Fmt; axisFmt?: Fmt; labelFmt?: (l: string) => string; height?: number;
  onPick?: (xValue: string) => void;
  /** wartość osi X wyróżniona (np. wybrany miesiąc) – pozostałe słupki przygaszone */
  highlight?: string;
}) {
  const p = usePalette();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -6, bottom: 0 }} barGap={2}
        style={onPick ? { cursor: "pointer" } : undefined}
        onClick={onPick ? (st) => { if (st?.activeLabel !== undefined) onPick(String(st.activeLabel)); } : undefined}>
        <CartesianGrid vertical={false} stroke={p.grid} />
        <XAxis dataKey={x} tick={{ fontSize: 11, fill: p.tick }} tickLine={false} axisLine={false} tickFormatter={labelFmt} minTickGap={6} />
        <YAxis tick={{ fontSize: 11, fill: p.tick }} tickLine={false} axisLine={false} tickFormatter={axisFmt} width={60} />
        <Tooltip cursor={{ fill: "rgba(148,163,184,0.12)" }} content={<TooltipBox fmt={fmt} labelFmt={labelFmt} />} />
        {series.length > 1 && legend}
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} maxBarSize={28} radius={[4, 4, 0, 0]}>
            {highlight !== undefined && data.map((d, i) => (
              <Cell key={i} fillOpacity={(d as Record<string, unknown>)[x] === highlight ? 1 : 0.45} />
            ))}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Lines({ data, x, series, fmt, axisFmt, labelFmt, height = 220 }: {
  data: object[]; x: string; series: Series[]; fmt: Fmt; axisFmt?: Fmt; labelFmt?: (l: string) => string; height?: number;
}) {
  const p = usePalette();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -6, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={p.grid} />
        <XAxis dataKey={x} tick={{ fontSize: 11, fill: p.tick }} tickLine={false} axisLine={false} tickFormatter={labelFmt} minTickGap={14} />
        <YAxis tick={{ fontSize: 11, fill: p.tick }} tickLine={false} axisLine={false} tickFormatter={axisFmt} width={60} />
        <Tooltip cursor={{ stroke: p.muted, strokeDasharray: "3 3" }} content={<TooltipBox fmt={fmt} labelFmt={labelFmt} />} />
        {series.length > 1 && legend}
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2}
            strokeDasharray={s.dashed ? "5 4" : undefined} dot={false} activeDot={{ r: 4, strokeWidth: 2 }} connectNulls={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Poziome słupki z etykietą (ranking kategorii / sklepów) – czytelniejsze od wykresu kołowego. */
export function RankBars({ rows, fmt, onPick }: {
  rows: { key: string; label: React.ReactNode; value: number; hint?: React.ReactNode; limit?: number | null }[];
  fmt: Fmt; onPick?: (key: string) => void;
}) {
  const max = Math.max(...rows.map((r) => Math.max(r.value, r.limit ?? 0)), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const over = r.limit ? r.value > r.limit : false;
        return (
          <li key={r.key}>
            <button type="button" disabled={!onPick} onClick={() => onPick?.(r.key)}
              className="group block w-full rounded-xl text-left enabled:hover:bg-slate-900/[0.03] dark:enabled:hover:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-2.5">{r.label}</div>
                <div className="shrink-0 text-right">
                  <span className="font-semibold tnum">{fmt(r.value)}</span>
                  {r.hint && <span className="ml-1.5 text-xs text-slate-500 dark:text-slate-400">{r.hint}</span>}
                </div>
              </div>
              <div className="relative mt-1.5 h-2 rounded-full bg-slate-100 dark:bg-white/5">
                <div className={`h-2 rounded-full ${over ? "bg-red-500" : "bg-[#2a78d6] dark:bg-[#3987e5]"}`}
                  style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }} />
                {r.limit && (
                  <div className="absolute -top-1 h-4 w-0.5 rounded bg-slate-700 dark:bg-slate-200" style={{ left: `calc(${(r.limit / max) * 100}% - 1px)` }}
                    title={`Limit: ${fmt(r.limit)}`} />
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export interface DonutSlice { key: string; name: string; amount: number; share: number; color: string; icon?: React.ReactNode; hint?: string }

/**
 * Wykres kołowy (pierścień) z sumą w środku i legendą z kwotami – kolor nigdy nie jest jedyną
 * informacją: każdy kawałek ma w legendzie nazwę, kwotę i udział.
 */
export function Donut({ slices, total, fmt, onPick, centerLabel = "razem" }: {
  slices: DonutSlice[]; total: number; fmt: Fmt; onPick?: (key: string) => void; centerLabel?: string;
}) {
  const p = usePalette();
  const [hover, setHover] = useState<number | null>(null);
  const active = hover !== null ? slices[hover] : null;
  return (
    // legenda obok pierścienia tylko w szerokiej karcie, w wąskiej – pod nim
    <div className="@container"><div className="flex flex-col items-center gap-5 @lg:flex-row">
      <div className="relative size-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="amount" nameKey="name" innerRadius="62%" outerRadius="100%" startAngle={90} endAngle={-270}
              stroke={p.surface} strokeWidth={2} isAnimationActive={false}
              onMouseEnter={(_, i) => setHover(i)} onMouseLeave={() => setHover(null)}
              onClick={(_, i) => onPick?.(slices[i].key)} style={onPick ? { cursor: "pointer" } : undefined}>
              {slices.map((s, i) => <Cell key={s.key} fill={s.color} fillOpacity={hover === null || hover === i ? 1 : 0.35} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="max-w-28 truncate text-[11px] text-slate-500 dark:text-slate-400">{active ? active.name : centerLabel}</span>
          <span className="font-display text-xl font-bold tnum">{fmt(active ? active.amount : total)}</span>
          {active && <span className="text-xs text-slate-500 tnum dark:text-slate-400">{Math.round(active.share * 100)}%</span>}
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1">
        {slices.map((s, i) => (
          <li key={s.key}>
            <button type="button" disabled={!onPick}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => onPick?.(s.key)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm enabled:hover:bg-slate-900/[0.03] dark:enabled:hover:bg-white/[0.04]">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              {s.icon}
              <span className="min-w-0 flex-1 truncate">{s.name}{s.hint && <span className="ml-1 text-xs text-slate-400">{s.hint}</span>}</span>
              <span className="shrink-0 font-semibold tnum">{fmt(s.amount)}</span>
              <span className="w-9 shrink-0 text-right text-xs text-slate-500 tnum dark:text-slate-400">{Math.round(s.share * 100)}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div></div>
  );
}
