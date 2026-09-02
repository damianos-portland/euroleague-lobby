// ---------------------------------------------------------------------------
// Official EuroLeague Fantasy credits (Dunkest "fantaking" API — the engine
// behind euroleaguefantasy.euroleaguebasketball.net).
//
// Live fetch needs a Bearer token (a Laravel Sanctum token issued to a logged-in
// game account). Set FANTAKING_TOKEN (+ optional list/matchday ids) in the env.
// Without a token — or if the fetch fails — we fall back to the committed seed
// snapshot in data/fantasy-credits-2026-27.json so init always works.
//
// The `quotation` field IS the fantasy credit. Head Coaches are skipped.
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";

export interface CreditRow {
  name: string;
  credit: number;
  team?: string;
  position?: string;
}

const API = "https://fantaking-api.dunkest.com/api/v1";
const ORIGIN = "https://euroleaguefantasy.euroleaguebasketball.net";
const LIST_ID = process.env.FANTAKING_LIST_ID || "49";
const MATCHDAY_ID = process.env.FANTAKING_MATCHDAY_ID || "1528";
const SEED_PATH = path.join(process.cwd(), "data", "fantasy-credits-2026-27.json");

function normalize(data: any[]): CreditRow[] {
  return (data || [])
    .filter((p) => p?.position?.name !== "Head Coach")
    .map((p) => ({
      name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
      credit: Number(p.quotation),
      team: p.team?.abbreviation,
      position: p.position?.name,
    }))
    .filter((r) => r.name && Number.isFinite(r.credit));
}

// Live pull from the fantaking API. Returns null on any failure so callers can
// fall back to the seed.
export async function fetchLiveCredits(): Promise<CreditRow[] | null> {
  const token = process.env.FANTAKING_TOKEN;
  if (!token) return null;
  const url = `${API}/players-lists/${LIST_ID}/matchdays/${MATCHDAY_ID}/players?per_page=-1&page=1&sort_by=quotation&sort_order=desc`;
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, origin: ORIGIN, accept: "application/json" },
    });
    if (!res.ok) {
      console.warn(`fantaking fetch failed: HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    return normalize(json.data);
  } catch (e) {
    console.warn("fantaking fetch error:", (e as Error).message);
    return null;
  }
}

export function readSeedCredits(): CreditRow[] {
  const raw = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
  return normalize(raw.data ?? raw);
}

// Live first, seed fallback.
export async function getFantasyCredits(): Promise<{ rows: CreditRow[]; source: "live" | "seed" }> {
  const live = await fetchLiveCredits();
  if (live && live.length) return { rows: live, source: "live" };
  return { rows: readSeedCredits(), source: "seed" };
}
