// Funkcja Netlify: podpowiedź kategorii i czytelnej nazwy sklepu dla pozycji z wyciągu bankowego,
// których aplikacja nie zna z Twojej historii. Numery kont i kart przeglądarka usuwa przed wysłaniem.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { guard, json } from "../lib/common.mts";

const Result = z.object({
  items: z.array(z.object({
    i: z.number().int().describe("numer pozycji z listy"),
    merchant: z.string().nullable().describe("Krótka nazwa sklepu / firmy / osoby, np. „Biedronka”, „McDonald's”, „Orlen”; null, gdy nie da się ustalić"),
    category_id: z.number().int().nullable().describe("id kategorii pasującej do rodzaju pozycji (wydatek/przychód) albo null"),
  })),
});

const SYSTEM = `Przypisujesz kategorie budżetu domowego pozycjom z polskiego wyciągu bankowego.

Każda pozycja ma rodzaj (wydatek albo przychód), kwotę i opis z banku. Opis zaczyna się rodzajem operacji (np. TRANSAKCJA KARTĄ, PRZELEW KRAJOWY, BLIK), potem kontrahent i tytuł; przy kartach bywa kod MCC (np. 5411 sklep spożywczy, 5541/5542 stacja paliw, 5912 apteka, 5814 fast food, 5812 restauracja).

Zasady:
- Wydatkom przypisuj wyłącznie kategorie wydatków, przychodom – kategorie przychodów (z podanej listy).
- merchant: nazwa handlowa, bez numeru sklepu i miasta („MCDONALDS 12 Krakow POL” → „McDonald's”, „PPHU PIEKARNIA KOWALSKI” → „Piekarnia Kowalski”).
- Gdy nie wiadomo, na co poszły pieniądze (np. przelew do osoby prywatnej bez tytułu), category_id = null.
- Zwróć wynik dla każdej pozycji z listy.`;

export default async (req: Request) => {
  const denied = await guard(req);
  if (denied) return denied;

  let body: { lines?: { i: number; kind: string; amount: number; text: string }[]; categories?: { id: number; name: string; kind: string }[] };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Nieprawidłowe zapytanie." });
  }
  const lines = (body.lines ?? []).slice(0, 60);
  if (!lines.length) return json(200, { items: [] });
  const cats = (body.categories ?? []).slice(0, 100);
  const list = (kind: string) => cats.filter((c) => c.kind === kind).map((c) => `${Number(c.id)}: ${String(c.name).slice(0, 60)}`).join("\n");
  const prompt = `Kategorie wydatków (id: nazwa):\n${list("expense") || "(brak)"}\n\nKategorie przychodów (id: nazwa):\n${list("income") || "(brak)"}\n\nPozycje:\n` +
    lines.map((l) => `${Number(l.i)}. ${l.kind === "income" ? "przychód" : "wydatek"} ${Number(l.amount).toFixed(2)} zł – ${String(l.text).slice(0, 300)}`).join("\n");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 55_000, maxRetries: 1 });
  try {
    const msg = await client.beta.messages.parse({
      model: process.env.CATEGORIZE_MODEL || "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "low", format: betaZodOutputFormat(Result) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    if (msg.stop_reason === "refusal" || !msg.parsed_output) return json(502, { error: "Nie udało się dobrać kategorii." });
    return json(200, msg.parsed_output);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json(500, { error: "Nieprawidłowy klucz ANTHROPIC_API_KEY." });
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: "Za dużo zapytań – spróbuj za chwilę." });
    if (e instanceof Anthropic.APIConnectionTimeoutError) return json(504, { error: "Dobieranie kategorii trwało za długo." });
    if (e instanceof Anthropic.APIError) return json(502, { error: `Błąd usługi (${e.status ?? "?"}).` });
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
};
