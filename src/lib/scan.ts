// Skanowanie paragonu: zmniejszenie zdjęcia w przeglądarce → funkcja Netlify (Claude) → wynik do sprawdzenia.
import type { Category, ScanResult } from "../engine/types";
import { supabase } from "./supabase";

export interface PreparedImage { blob: Blob; base64: string; mediaType: "image/jpeg"; url: string }

/**
 * Zmniejsza zdjęcie do JPEG (dłuższy bok ≤ 2000 px). Paragon jest długi i wąski, więc
 * ograniczamy dłuższy bok, a nie szerokość – tekst zostaje czytelny, plik ma zwykle 200–600 kB.
 */
export async function prepareImage(file: File, maxSide = 2000): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Nie da się otworzyć tego zdjęcia. Jeśli to plik HEIC z iPhone'a, użyj przycisku „Zrób zdjęcie” albo zapisz zdjęcie jako JPG.");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Nie udało się przetworzyć zdjęcia"))), "image/jpeg", 0.82));
  const base64 = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
  return { blob, base64, mediaType: "image/jpeg", url: URL.createObjectURL(blob) };
}

const ERRORS: Record<number, string> = {
  401: "Sesja wygasła – zaloguj się ponownie.",
  404: "Brak funkcji skanowania – strona musi działać na Netlify (lokalnie: netlify dev).",
  413: "Zdjęcie jest za duże.",
  502: "Odczyt trwał za długo albo serwer się nie odezwał – spróbuj jeszcze raz.",
  504: "Odczyt trwał za długo – spróbuj jeszcze raz (najlepiej wyraźniejsze, równe zdjęcie).",
};

export async function scanReceipt(img: PreparedImage, categories: Category[]): Promise<ScanResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error(ERRORS[401]);
  const res = await fetch("/.netlify/functions/scan-receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      image: img.base64,
      mediaType: img.mediaType,
      categories: categories.filter((c) => c.kind === "expense" && !c.archived).map((c) => ({ id: c.id, name: c.name })),
    }),
  });
  const body = await res.json().catch(() => null) as (ScanResult & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error || ERRORS[res.status] || `Błąd skanowania (${res.status})`);
  return body;
}

/** Zapisuje zdjęcie w prywatnym kubełku; null, gdy się nie da (np. brak kubełka) – paragon i tak się zapisze. */
export async function uploadReceiptImage(blob: Blob): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const path = `${data.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from("cf-receipts").upload(path, blob, { contentType: "image/jpeg" });
  return error ? null : path;
}

export async function receiptImageUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("cf-receipts").createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}
