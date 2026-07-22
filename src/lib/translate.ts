// ---------------------------------------------------------------------------
// Text translation to Greek for scraped news headlines.
//
// Primary: Claude (claude-opus-4-8) — batch-translates headlines with correct
// basketball/team/player terminology. Requires ANTHROPIC_API_KEY.
// Fallback: MyMemory (free, key-less) when no API key is configured or Claude
// fails. Every failure path returns null so callers fall back to the original
// text; translation is a nice-to-have, never a hard dependency.
// ---------------------------------------------------------------------------

import Anthropic from "@anthropic-ai/sdk";

// Map a NewsItem.source to its ISO source language.
const SOURCE_LANG: Record<string, string> = {
  eurohoops: "en",
  sportando: "it",
};

export function sourceLang(source: string): string {
  return SOURCE_LANG[source] ?? "en";
}

export function hasClaudeKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// ---------------------------------------------------------------------------
// Claude — batch translation (preferred)
// ---------------------------------------------------------------------------

export interface TranslateItem {
  id: string;
  text: string;
  from: string; // ISO source language ("en" | "it" | …)
}

const SYSTEM_PROMPT = [
  "You are a professional sports-news translator for a Greek EuroLeague fantasy website.",
  "Translate each headline into natural, fluent Greek exactly as a Greek basketball journalist would write it.",
  "Rules:",
  "- Team names, player names, and competitions must be correct in Greek sports usage.",
  "  Team nicknames that are also common words are TEAMS, not literal words (e.g. 'Heat' = οι Μαϊάμι Χιτ, never 'ζέστη'; 'Thunder', 'Magic', etc. likewise).",
  "- 'free agency'/'free agent' → «ελεύθερος» / «ελεύθερη ατζέντα», not a literal translation.",
  "- Transliterate player names to their conventional Greek form when one is standard; otherwise keep the Latin spelling.",
  "- Keep it a headline: concise, no added commentary, no quotes around the whole line.",
  "Return only the translations via the required structured format.",
].join("\n");

const BATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          i: { type: "integer" },
          el: { type: "string" },
        },
        required: ["i", "el"],
      },
    },
  },
  required: ["translations"],
} as const;

// Translate a batch of headlines. Returns a Map of item.id -> Greek text for
// every item Claude returned; missing/failed items are simply absent (caller
// falls back). Throws only on a hard SDK error — callers should catch.
export async function translateBatchViaClaude(items: TranslateItem[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (items.length === 0) return out;

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  const payload = items.map((it, i) => ({ i, lang: it.from, text: it.text }));

  const resp = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    output_config: { effort: "low", format: { type: "json_schema", schema: BATCH_SCHEMA } },
    messages: [
      {
        role: "user",
        content:
          "Translate every headline in this JSON array to Greek. `lang` is the source language of that headline.\n" +
          JSON.stringify(payload),
      },
    ],
  } as any);

  const textBlock = resp.content.find((b: any) => b.type === "text") as any;
  if (!textBlock?.text) return out;

  let parsed: any;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    return out;
  }
  for (const t of parsed?.translations ?? []) {
    const item = items[t?.i];
    const el = typeof t?.el === "string" ? t.el.trim() : "";
    if (item && el) out.set(item.id, el);
  }
  return out;
}

// ---------------------------------------------------------------------------
// MyMemory — free fallback (used when ANTHROPIC_API_KEY is absent)
// ---------------------------------------------------------------------------

const MAX_LEN = 480;

function looksLikeError(text: string): boolean {
  return /MYMEMORY\s+WARNING|QUOTA|INVALID|PLEASE\s+SELECT/i.test(text);
}

// Translate `text` from `from` (ISO code) to Greek via MyMemory. Returns null on
// any failure or if the result is empty/echoes the input.
export async function translateToGreek(text: string, from: string): Promise<string | null> {
  const trimmed = (text || "").trim();
  if (!trimmed || trimmed.length > MAX_LEN) return null;
  if (from === "el") return null;

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
    const outText = String(j?.responseData?.translatedText ?? "").trim();
    if (!outText || looksLikeError(outText)) return null;
    if (outText.toLowerCase() === trimmed.toLowerCase()) return null;
    return outText;
  } catch {
    return null;
  }
}
