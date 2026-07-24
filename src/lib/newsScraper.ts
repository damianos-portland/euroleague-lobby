// ---------------------------------------------------------------------------
// Transfer news scraper: RSS feeds -> entity-matched, classified NewsItems.
// Pure helpers (parseRss/classifyItem/matchEntities) are unit-tested; the
// scrapeNews() orchestrator fetches feeds and upserts into the DB.
// ---------------------------------------------------------------------------

import { prisma } from "./db";

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

// Greek + English EuroLeague news feeds only.
//   • curated      → already EuroLeague-scoped; keep every item.
//   • requireGreek → keep only items whose title has Greek script (the Greek
//                    edition cross-posts a little Turkish/English we filter out).
// Non-curated feeds also pass the EuroLeague relevance filter.
export const FEEDS: { source: string; url: string; curated?: boolean; requireGreek?: boolean }[] = [
  { source: "eurohoops", url: "https://www.eurohoops.net/en/euroleague/feed/", curated: true }, // English (EuroLeague)
  { source: "eurohoops-gr", url: "https://www.eurohoops.net/feed/", requireGreek: true },         // Greek
  { source: "talkbasket", url: "https://www.talkbasket.net/feed" },                                // English
];

// Club alias -> E-code for the 20 EuroLeague clubs (lowercase substrings).
// Includes Greek forms so Greek-language articles match team chips too.
export const CLUB_ALIASES: Record<string, string[]> = {
  MAD: ["real madrid", "ρεάλ μαδρίτης", "ρεάλ"],
  BAR: ["barcelona", "barça", "μπαρτσελόνα", "μπάρτσα"],
  PAN: ["panathinaikos", "παναθηναϊκός", "παναθηναϊκο"],
  OLY: ["olympiacos", "ολυμπιακός", "ολυμπιακο"],
  ULK: ["fenerbahce", "fenerbahçe", "φενέρμπαχτσε", "φενέρ"],
  IST: ["anadolu efes", "efes", "έφες", "εφές"],
  MCO: ["monaco", "μονακό"],
  ASV: ["asvel", "villeurbanne", "ασβέλ"],
  PRS: ["paris basketball", "παρί"],
  MIL: ["olimpia milano", "armani", "μιλάνο", "αρμάνι"],
  VIR: ["virtus bologna", "virtus", "βίρτους", "μπολόνια"],
  RED: ["crvena zvezda", "red star", "ερυθρός αστέρας", "τσρβένα ζβέζντα"],
  PAR: ["partizan", "παρτίζαν"],
  MUN: ["bayern", "μπάγερν"],
  BAS: ["baskonia", "μπασκόνια"],
  PAM: ["valencia basket", "valencia", "βαλένθια", "βαλένσια"],
  ZAL: ["zalgiris", "žalgiris", "ζάλγκιρις"],
  TEL: ["maccabi tel aviv", "maccabi", "μακάμπι"],
  HTA: ["hapoel tel aviv", "hapoel", "χάποελ"],
  DUB: ["dubai basketball", "dubai", "ντουμπάι"],
  BES: ["besiktas", "beşiktaş", "μπεσίκτας"],
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
export async function scrapeNews(): Promise<{ fetched: number; stored: number }> {
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
      // Greek edition: drop the occasional cross-posted Turkish/English item.
      if (feed.requireGreek && !/[\u0370-\u03ff]/.test(item.title)) continue;
      const text = `${item.title} ${item.description}`;
      const { playerId, teamCodes } = matchEntities(text, players);
      // Curated feeds are already EuroLeague-only. For general feeds, keep only
      // items about our league: a matched player, club, or a EuroLeague mention.
      if (!feed.curated && !playerId && teamCodes.length === 0 && !/euroleague|ευρωλίγκα/i.test(text)) {
        continue;
      }
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

  return { fetched, stored };
}
