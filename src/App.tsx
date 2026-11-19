import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Notice, Spinner, ToastProvider } from "./components/ui";
import { DataProvider, useData } from "./lib/DataContext";
import { configured, supabase } from "./lib/supabase";
import { ChangelogPage } from "./pages/Changelog";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { ReportsPage } from "./pages/Reports";
import { ScanPage } from "./pages/Scan";
import { SettingsPage } from "./pages/Settings";
import { TransactionsPage } from "./pages/Transactions";

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center p-6"><div className="max-w-md">{children}</div></div>;
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function Shell() {
  const { loading, error, data } = useData();
  if (!data && loading) return <Centered><Spinner label="Wczytywanie danych…" /></Centered>;
  if (!data && error) {
    const hint = /cf_|relation|schema cache/i.test(error)
      ? " – wygląda na to, że w Supabase nie ma jeszcze tabel. Uruchom plik supabase/migrations/…_init.sql w SQL Editor (INSTRUKCJA.md, krok 1)."
      : "";
    return <Centered><Notice tone="error">Nie udało się wczytać danych: {error}{hint}</Notice></Centered>;
  }
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/transakcje" element={<TransactionsPage />} />
        <Route path="/skanuj" element={<ScanPage />} />
        <Route path="/raporty" element={<ReportsPage />} />
        <Route path="/ustawienia" element={<SettingsPage />} />
        <Route path="/co-nowego" element={<ChangelogPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configured) {
    return (
      <Centered>
        <Notice tone="warn">
          Brak konfiguracji Supabase. Ustaw zmienne <b>VITE_SUPABASE_URL</b> i <b>VITE_SUPABASE_ANON_KEY</b>
          {" "}(Netlify → Site configuration → Environment variables) i wdróż stronę ponownie.
        </Notice>
      </Centered>
    );
  }
  if (session === undefined) return <Centered><Spinner /></Centered>;
  if (!session) return <Login />;
  return (
    <BrowserRouter>
      <ToastProvider>
        {/* key: po zmianie konta dane wczytują się od nowa */}
        <DataProvider key={session.user.id}>
          <ScrollTop />
          <Shell />
        </DataProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
