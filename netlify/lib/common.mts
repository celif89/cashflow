// Wspólne dla funkcji Netlify: odpowiedź JSON i sprawdzenie, że woła zalogowany użytkownik aplikacji.
import { createClient } from "@supabase/supabase-js";

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });

/** null = wszystko w porządku; inaczej gotowa odpowiedź z błędem. */
export async function guard(req: Request): Promise<Response | null> {
  if (req.method !== "POST") return json(405, { error: "Tylko POST" });
  if (!process.env.ANTHROPIC_API_KEY) return json(500, { error: "Brak klucza ANTHROPIC_API_KEY w ustawieniach Netlify (Site configuration → Environment variables)." });
  const url = process.env.VITE_SUPABASE_URL, anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) return json(500, { error: "Brak VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY w ustawieniach Netlify." });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Brak logowania." });
  const { data, error } = await createClient(new URL(url).origin, anon.trim()).auth.getUser(token);
  if (error || !data.user) return json(401, { error: "Sesja wygasła – zaloguj się ponownie." });
  return null;
}
