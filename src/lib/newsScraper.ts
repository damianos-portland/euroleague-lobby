// ---------------------------------------------------------------------------
// Transfer news scraper: RSS feeds -> entity-matched, classified NewsItems.
// Pure helpers (parseRss/classifyItem/matchEntities) are unit-tested; the
// scrapeNews() orchestrator fetches feeds and upserts into the DB.
// ---------------------------------------------------------------------------

import { prisma } from "./db";
import { translateToGreek, translateBatchViaClaude, sourceLang, hasClaudeKey } from "./translate";

export interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: Date;
}

export interface Classification {
  kind: "official" | "rumor" | "news";
  confidence: number; // 0 unless rumor
}

export const FEEDS: { source: string; url: string }[] = [
  { source: "eurohoops", url: "https://www.eurohoops.net/en/feed/" },
  { source: "sportando", url: "https://sportando.basketball/feed/" },
];

// Club alias -> E-code for the 20 EuroLeague clubs (lowercase substrings).
export const CLUB_ALIASES: Record<string, string[]> = {
  MAD: ["real madrid"],
  BAR: ["barcelona", "barça"],
  PAN: ["panathinaikos"],
  OLY: ["olympiacos"],
  ULK: ["fenerbahce", "fenerbahçe"],
  IST: ["anadolu efes", "efes"],
  MCO: ["monaco"],
  ASV: ["asvel", "villeurbanne"],
  PRS: ["paris basketball"],
  MIL: ["olimpia milano", "milan", "armani"],
  VIR: ["virtus bologna", "virtus"],
  RED: ["crvena zvezda", "red star"],
  PAR: ["partizan"],
  MUN: ["bayern"],
  BAS: ["baskonia"],
  PAM: ["valencia basket", "valencia"],
  ZAL: ["zalgiris", "žalgiris"],
  TEL: ["maccabi tel aviv", "maccabi"],
  HTA: ["hapoel tel aviv", "hapoel"],
  DUB: ["dubai basketball", "dubai"],
  BES: ["besiktas", "beşiktaş"], // 2026-27 newcomer
};

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/<[^>]+>/g, "") // strip any leftover HTML tags
    .trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
}

export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const title = tag(block, "title");
    const link = tag(block, "link");
    if (!title || !link) continue;
    const pub = new Date(tag(block, "pubDate"));
    items.push({
      title,
      link,
      description: tag(block, "description").slice(0, 500),
      pubDate: isNaN(pub.getTime()) ? new Date() : pub,
    });
  }
  return items;
}

const OFFICIAL_RE = /\b(officially|signs|signed|agrees|commits|extends|completed|inks)\b/;
const RUMOR_RE = /\b(reportedly|rumor|rumour|linked|target|targets|interest|interested|negotiating|talks|close to|frontrunner|eyeing|monitoring)\b/;

export function classifyItem(title: string, description: string): Classification {
  const text = `${title} ${description}`.toLowerCase();
  // Rumor language wins over official verbs ("reportedly signs" is a rumor).
  if (RUMOR_RE.test(text)) {
    let c = 40;
    if (/\bclose to\b|\bagreement (is )?near\b|\bset to sign\b/.test(text)) c += 20;
    if (/\badvanced talks\b|\bnegotiat/.test(text)) c += 15;
    if (/\baccording to\b|\bsources?\b|\bper\b/.test(text)) c += 10;
    if (/\bdenie[sd]\b|\bunlikely\b|\bno deal\b/.test(text)) c -= 15;
    return { kind: "rumor", confidence: Math.max(10, Math.min(90, c)) };
  }
  if (OFFICIAL_RE.test(text)) return { kind: "official", confidence: 0 };
  return { kind: "news", confidence: 0 };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface EntityMatch {
  playerId: string | null;
  teamCodes: string[];
}

export function matchEntities(
  text: string,
  players: { id: string; firstName: string; lastName: string }[]
): EntityMatch {
  const lower = text.toLowerCase();

  const teamCodes: string[] = [];
  for (const [code, aliases] of Object.entries(CLUB_ALIASES)) {
    if (aliases.some((a) => lower.includes(a))) teamCodes.push(code);
  }

  let playerId: string | null = null;
  const lastCount = new Map<string, number>();
  for (const p of players) {
    const k = p.lastName.toLowerCase();
    lastCount.set(k, (lastCount.get(k) ?? 0) + 1);
  }
  for (const p of players) {
    const last = p.lastName.toLowerCase();
    if (!new RegExp(`(?<![a-z0-9])${escapeRe(last)}(?![a-z0-9])`).test(lower)) continue;
    const unique = (lastCount.get(last) ?? 0) === 1;
    const firstToo = new RegExp(`(?<![a-z0-9])${escapeRe(p.firstName.toLowerCase())}(?![a-z0-9])`).test(lower);
    if (unique || firstToo) {
      playerId = p.id;
      break;
    }
  }
  return { playerId, teamCodes };
}

// ---------------------------------------------------------------------------
// Orchestrator: fetch feeds, classify, upsert. Keeps newest 500 items.
// ---------------------------------------------------------------------------
export async function scrapeNews(): Promise<{ fetched: number; stored: number; translated: number }> {
  const players = await prisma.player.findMany({
    select: { id: true, firstName: true, lastName: true },
  });

  let fetched = 0;
  let stored = 0;
  for (const feed of FEEDS) {
    let xml = "";
    try {
      const r = await fetch(feed.url, {
        headers: { "User-Agent": "Mozilla/5.0 (EuroLeagueLobby)", Accept: "application/rss+xml,application/xml,*/*" },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) continue;
      xml = await r.text();
    } catch {
      continue; // a dead feed must not kill the run
    }
    for (const item of parseRss(xml)) {
      fetched++;
      const text = `${item.title} ${item.description}`;
      const { playerId, teamCodes } = matchEntities(text, players);
      // Keep only items about our league: a matched player, a matched club,
      // or at least an explicit EuroLeague mention.
      if (!playerId && teamCodes.length === 0 && !/euroleague/i.test(text)) continue;
      const cls = classifyItem(item.title, item.description);
      await prisma.newsItem.upsert({
        where: { url: item.link },
        update: {}, // never rewrite an existing story
        create: {
          url: item.link,
          source: feed.source,
          title: item.title,
          summary: item.description,
          publishedAt: item.pubDate,
          kind: cls.kind,
          confidence: cls.confidence,
          playerId,
          teamCodes: teamCodes.join(","),
        },
      });
      stored++;
    }
  }

  // Prune: keep the newest 500 by publishedAt.
  const excess = await prisma.newsItem.findMany({
    orderBy: { publishedAt: "desc" },
    skip: 500,
    select: { id: true },
  });
  if (excess.length > 0) {
    await prisma.newsItem.deleteMany({ where: { id: { in: excess.map((e) => e.id) } } });
  }

  // Translate any item still lacking a Greek title (backfills old rows + new
  // ones). Idempotent, so remaining items get picked up on the next run.
  const translated = await translatePendingNews();

  return { fetched, stored, translated };
}

// Auto-translate NewsItem titles to Greek (title is what the feed/ticker show).
//   • ANTHROPIC_API_KEY set  → Claude (claude-opus-4-8), batched, best quality.
//   • otherwise              → MyMemory free API, one call per item, paced.
// `retranslate: true` reprocesses ALL rows (used to upgrade existing MyMemory
// translations after enabling Claude); default only fills untranslated rows.
export async function translatePendingNews(
  limit = 60,
  opts: { retranslate?: boolean } = {}
): Promise<number> {
  const pending = await prisma.newsItem.findMany({
    where: opts.retranslate ? {} : { titleEl: null },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: { id: true, title: true, source: true },
  });
  if (pending.length === 0) return 0;

  let done = 0;

  if (hasClaudeKey()) {
    // Claude: batch in chunks to bound output tokens; one failed chunk is skipped.
    const CHUNK = 40;
    for (let i = 0; i < pending.length; i += CHUNK) {
      const chunk = pending.slice(i, i + CHUNK).map((n) => ({
        id: n.id,
        text: n.title,
        from: sourceLang(n.source),
      }));
      let map = new Map<string, string>();
      try {
        map = await translateBatchViaClaude(chunk);
      } catch {
        continue; // translation failure must not break the scrape/cron
      }
      for (const [id, el] of map) {
        await prisma.newsItem.update({ where: { id }, data: { titleEl: el } });
        done++;
      }
    }
    return done;
  }

  // MyMemory fallback: sequential with a small gap to stay friendly to the free tier.
  for (const n of pending) {
    const el = await translateToGreek(n.title, sourceLang(n.source));
    if (el) {
      await prisma.newsItem.update({ where: { id: n.id }, data: { titleEl: el } });
      done++;
    }
    await new Promise((res) => setTimeout(res, 120));
  }
  return done;
}
