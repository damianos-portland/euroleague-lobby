// ---------------------------------------------------------------------------
// Lightweight text translation to Greek for scraped news headlines.
//
// Uses MyMemory (https://mymemory.translated.net) — a free, key-less REST API
// that works from serverless/datacenter IPs. We know each feed's source
// language, so we pass an explicit langpair for better quality. Every failure
// path returns null so callers fall back to the original text; translation is
// a nice-to-have, never a hard dependency.
//
// Optional: set MYMEMORY_EMAIL to raise the free daily quota (anon ~5k words,
// with email ~50k words/day).
// ---------------------------------------------------------------------------

// Map a NewsItem.source to its ISO source language.
const SOURCE_LANG: Record<string, string> = {
  eurohoops: "en",
  sportando: "it",
};

export function sourceLang(source: string): string {
  return SOURCE_LANG[source] ?? "en";
}

// MyMemory rejects/soft-fails very long strings on the free tier; headlines are
// short, so we cap defensively and skip anything oversized.
const MAX_LEN = 480;

function looksLikeError(text: string): boolean {
  // MyMemory returns quota/other messages in-band, e.g.
  // "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY".
  return /MYMEMORY\s+WARNING|QUOTA|INVALID|PLEASE\s+SELECT/i.test(text);
}

// Translate `text` from `from` (ISO code) to Greek. Returns null on any failure
// or if the result is empty/echoes the input — caller falls back to original.
export async function translateToGreek(text: string, from: string): Promise<string | null> {
  const trimmed = (text || "").trim();
  if (!trimmed || trimmed.length > MAX_LEN) return null;
  if (from === "el") return null; // already Greek, nothing to do

  const email = process.env.MYMEMORY_EMAIL;
  const params = new URLSearchParams({ q: trimmed, langpair: `${from}|el` });
  if (email) params.set("de", email);
  const url = `https://api.mymemory.translated.net/get?${params.toString()}`;

  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    if (j?.responseStatus !== 200) return null;
    const out = String(j?.responseData?.translatedText ?? "").trim();
    if (!out || looksLikeError(out)) return null;
    // If MyMemory couldn't translate it just echoes the source back.
    if (out.toLowerCase() === trimmed.toLowerCase()) return null;
    return out;
  } catch {
    return null;
  }
}
