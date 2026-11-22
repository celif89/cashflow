import { ChartColumn, LayoutDashboard, List, LogOut, Plus, ScanLine, Settings, Sparkles } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { APP_VERSION } from "../changelog";
import { useData } from "../lib/DataContext";
import { supabase } from "../lib/supabase";
import { TransactionEditor } from "./TransactionEditor";
import { cx } from "./ui";

const NAV = [
  { to: "/", label: "Pulpit", icon: LayoutDashboard, end: true },
  { to: "/transakcje", label: "Transakcje", icon: List, also: ["/import", "/do-sprawdzenia"] },
  { to: "/skanuj", label: "Skanuj", icon: ScanLine },
  { to: "/raporty", label: "Raporty", icon: ChartColumn },
  { to: "/ustawienia", label: "Ustawienia", icon: Settings, also: ["/stale-platnosci", "/co-nowego"] },
];

const SEEN_KEY = "cf.seenVersion";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-10 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 via-brand-600 to-accent-600 text-white shadow-lg shadow-brand-600/30">
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 17 9 12l3 2.5L19 7" />
          <path d="M15 7h4v4" />
        </svg>
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="font-display text-[17px] font-bold tracking-tight">Cashflow</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">budżet domowy</div>
        </div>
      )}
    </div>
  );
}

function useNewVersion(): [boolean, () => void] {
  const [isNew, setNew] = useState(false);
  useEffect(() => {
    try {
      const seen = localStorage.getItem(SEEN_KEY);
      if (!seen) localStorage.setItem(SEEN_KEY, APP_VERSION);
      else setNew(seen !== APP_VERSION);
    } catch { /* tryb prywatny */ }
  }, []);
  return [isNew, () => { try { localStorage.setItem(SEEN_KEY, APP_VERSION); } catch { /* */ } setNew(false); }];
}

export function Layout({ children }: { children: ReactNode }) {
  const [isNew, markSeen] = useNewVersion();
  const { openEditor, data } = useData();
  const { pathname } = useLocation();
  const active = (isActive: boolean, also?: string[]) => isActive || !!also?.some((p) => pathname.startsWith(p));
  const pending = data?.pending.length ?? 0;
  const badge = (to: string) => to === "/transakcje" && pending > 0
    ? <span className="absolute top-1 right-1/2 translate-x-5 rounded-full bg-amber-500 px-1.5 text-[10px] leading-4 font-bold text-white lg:static lg:ml-auto lg:translate-x-0 lg:px-2 lg:text-[11px] lg:leading-5"
        title={`${pending} do sprawdzenia`}>{pending}</span>
    : null;
  return (
    <div className="min-h-dvh lg:pl-72">
      {/* boczne menu – komputer */}
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r border-slate-200/70 bg-white/70 px-5 py-6 backdrop-blur-xl lg:flex dark:border-white/5 dark:bg-ink-900/60">
        <Link to="/" className="px-1"><Logo /></Link>
        <button className="btn btn-primary mt-6 w-full py-3" onClick={() => openEditor()}>
          <Plus className="size-4" /> Dodaj wydatek
        </button>
        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end, also }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => cx(
              "flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition",
              active(isActive, also)
                ? "bg-ink-900 text-white shadow-lg shadow-ink-900/20 dark:bg-white dark:text-ink-900"
                : "text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/5",
            )}>
              <Icon className="size-[18px]" /> {label} {badge(to)}
            </NavLink>
          ))}
        </nav>
        <Link to="/co-nowego" onClick={markSeen}
          className="mb-2 flex items-center justify-between rounded-2xl px-3.5 py-2.5 text-xs text-slate-500 transition hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/5">
          <span className="flex items-center gap-2"><Sparkles className="size-3.5" /> Co nowego</span>
          <span className={cx("rounded-full px-2 py-0.5 font-mono font-semibold", isNew ? "bg-brand-600 text-white" : "bg-slate-100 dark:bg-white/10")}>
            v{APP_VERSION}
          </span>
        </Link>
        <button className="btn btn-ghost justify-start px-3.5" onClick={() => supabase.auth.signOut()}>
          <LogOut className="size-4" /> Wyloguj
        </button>
      </aside>

      {/* nagłówek – telefon */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200/60 bg-white/80 px-4 py-2.5 backdrop-blur-xl lg:hidden dark:border-white/5 dark:bg-ink-950/80">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo compact />
          <div className="font-display text-[15px] font-bold">Cashflow</div>
        </Link>
        <div className="flex items-center gap-1">
          <Link to="/co-nowego" onClick={markSeen} className={cx("rounded-full px-2 py-1 font-mono text-[11px] font-semibold",
            isNew ? "bg-brand-600 text-white" : "text-slate-400")}>v{APP_VERSION}</Link>
          <button className="btn btn-ghost btn-icon" onClick={() => supabase.auth.signOut()} aria-label="Wyloguj">
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-5 pb-36 sm:px-6 lg:px-10 lg:pt-10 lg:pb-14">{children}</main>

      {/* pływający przycisk dodawania – telefon */}
      <button onClick={() => openEditor()} aria-label="Dodaj wydatek"
        className="fixed right-4 bottom-[6.5rem] z-30 flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-xl shadow-brand-600/40 transition active:scale-95 lg:hidden dark:bg-brand-500 dark:text-ink-950">
        <Plus className="size-6" />
      </button>

      {/* dolne menu – telefon */}
      <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 rounded-3xl border border-white/60 bg-white/90 p-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-2xl shadow-slate-900/15 backdrop-blur-xl lg:hidden dark:border-white/10 dark:bg-ink-900/90">
        {NAV.map(({ to, label, icon: Icon, end, also }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cx(
            "relative flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[10.5px] font-semibold transition",
            active(isActive, also) ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900" : "text-slate-500 dark:text-slate-400",
          )}>
            <Icon className="size-5" /> {label} {badge(to)}
          </NavLink>
        ))}
      </nav>

      <TransactionEditor />
    </div>
  );
}
