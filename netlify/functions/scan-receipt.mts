// Funkcja Netlify: odczyt zdjęcia paragonu przez Claude (wizja + odpowiedź w ustalonym formacie JSON).
// Klucz ANTHROPIC_API_KEY jest tylko tutaj, na serwerze – przeglądarka go nie widzi.
// Wywołać może wyłącznie zalogowany użytkownik aplikacji (sprawdzamy token Supabase).
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { guard, json } from "../lib/common.mts";

const ReceiptSchema = z.object({
  merchant: z.string().nullable().describe("Krótka nazwa sklepu, np. „Biedronka”, „Orlen”, „Rossmann”; null, gdy nieczytelna"),
  date: z.string().nullable().describe("Data sprzedaży w formacie RRRR-MM-DD; null, gdy nieczytelna"),
  total: z.number().describe("Kwota do zapłaty z linii SUMA / SUMA PLN / DO ZAPŁATY"),
  items: z.array(z.object({
    name: z.string().describe("Nazwa produktu, poprawiona z ucięć kasowych tam, gdzie to oczywiste"),
    amount: z.number().describe("Wartość pozycji w zł po rabatach (cena × ilość − rabat); rabat bez przypisanego produktu jako osobna ujemna pozycja"),
    category_id: z.number().int().nullable().describe("id kategorii z listy albo null, gdy żadna nie pasuje"),
  })),
});

const SYSTEM = `Odczytujesz zdjęcia polskich paragonów fiskalnych i zwracasz ich treść jako dane.

Zasady:
- Pozycje to sprzedane produkty i usługi. Pomijaj linie techniczne: NIP, numer kasy, PTU/VAT, SPRZEDAŻ OPODATKOWANA, reszta, karta, gotówka, numer transakcji.
- Linia typu „2 x 3,49 = 6,98” to jedna pozycja o wartości 6,98.
- Rabat / OPUST / promocja pod produktem zmniejsza wartość tego produktu. Rabat bez wskazanego produktu dodaj jako osobną pozycję z kwotą ujemną.
- Kaucję za butelki traktuj jak zwykłą pozycję (zwrot kaucji – kwota ujemna).
- Suma wartości pozycji powinna dać kwotę SUMA PLN. Jeśli części paragonu nie da się odczytać, zwróć to, co czytelne, i prawdziwą sumę z paragonu.
- merchant: nazwa handlowa sieci lub sklepu, nie nazwa spółki (np. „Biedronka”, a nie „Jeronimo Martins Polska S.A.”).
- category_id wybieraj wyłącznie z podanej listy kategorii użytkownika. Przypisuj każdą pozycję osobno – na jednym paragonie mogą być np. jedzenie i chemia.
- Jeśli zdjęcie nie przedstawia paragonu ani faktury, zwróć pustą listę pozycji, total 0, merchant null i date null.`;

const MEDIA = new Set(["image/jpeg", "image/png", "image/webp"]);

export default async (req: Request) => {
  // tylko zalogowani użytkownicy aplikacji
  const denied = await guard(req);
  if (denied) return denied;

  let body: { image?: string; mediaType?: string; categories?: { id: number; name: string }[] };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Nieprawidłowe zapytanie." });
  }
  const image = body.image ?? "";
  const mediaType = body.mediaType ?? "image/jpeg";
  if (!image || !MEDIA.has(mediaType)) return json(400, { error: "Brak zdjęcia (JPEG, PNG lub WebP)." });
  if (image.length > 5_500_000) return json(413, { error: "Zdjęcie jest za duże." });
  const categories = (body.categories ?? []).slice(0, 100).map((c) => `${Number(c.id)}: ${String(c.name).slice(0, 60)}`).join("\n");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 55_000, maxRetries: 1 });
  try {
    const msg = await client.beta.messages.parse({
      model: process.env.RECEIPT_MODEL || "claude-opus-5-5",
      max_tokens: 16000,
      // odczyt paragonu to ekstrakcja, nie rozumowanie – niski wysiłek skraca czas odpowiedzi
      output_config: { effort: "low", format: betaZodOutputFormat(ReceiptSchema) },
      // gdy model odmówi (np. fałszywy alarm filtra), serwer sam ponowi na zapasowym modelu
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg", data: image } },
          { type: "text", text: `Kategorie użytkownika (id: nazwa):\n${categories || "(brak)"}\n\nOdczytaj ten paragon.` },
        ],
      }],
    });
    if (msg.stop_reason === "refusal") return json(422, { error: "Nie udało się odczytać tego zdjęcia. Wpisz wydatek ręcznie." });
    if (msg.stop_reason === "max_tokens" || !msg.parsed_output) return json(502, { error: "Odczyt paragonu się nie powiódł – spróbuj ponownie." });
    return json(200, msg.parsed_output);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json(500, { error: "Nieprawidłowy klucz ANTHROPIC_API_KEY." });
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: "Za dużo zapytań – spróbuj za chwilę." });
    if (e instanceof Anthropic.APIConnectionTimeoutError) return json(504, { error: "Odczyt trwał za długo – spróbuj ponownie." });
    if (e instanceof Anthropic.APIError) return json(502, { error: `Błąd usługi odczytu (${e.status ?? "?"}).` });
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
};
