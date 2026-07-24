import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeFantasyPoints } from "@/lib/types";
import { requireAdmin } from "@/lib/authz";

// Import players (and optional last-season stats) from JSON array or CSV text.
// Admin-only. CSV header (any subset, order-independent):
//   firstName,lastName,position,nationality,age,teamShort,status,depthRole,
//   fantasyPrice,tags,season,minutes,points,rebounds,assists,steals,blocks,turnovers,usage,pir
export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { format, payload } = await req.json();
  let rows: any[] = [];
  try {
    rows = format === "csv" ? parseCsv(payload) : JSON.parse(payload);
  } catch (e: any) {
    return NextResponse.json({ error: "Parse error: " + e.message }, { status: 400 });
  }
  if (!Array.isArray(rows)) return NextResponse.json({ error: "Expected an array" }, { status: 400 });

  const teams = await prisma.team.findMany();
  const teamByShort = new Map(teams.map((t) => [t.shortName, t.id]));

  let created = 0, updated = 0, stats = 0;
  for (const r of rows) {
    if (!r.firstName || !r.lastName) continue;
    const teamId = r.teamShort ? teamByShort.get(r.teamShort) ?? null : r.teamId ?? null;
    const num = (v: any, d = 0) => (v === undefined || v === "" ? d : Number(v));

    const existing = await prisma.player.findFirst({
      where: { firstName: r.firstName, lastName: r.lastName },
    });

    const data = {
      position: r.position ?? "SG", nationality: r.nationality ?? "—", age: num(r.age, 25),
      teamId, status: r.status ?? "signed", depthRole: r.depthRole ?? "rotation",
      fantasyPrice: num(r.fantasyPrice, 5), tags: r.tags ?? "",
    };

    let playerId: string;
    if (existing) {
      await prisma.player.update({ where: { id: existing.id }, data });
      playerId = existing.id;
      updated++;
    } else {
      const p = await prisma.player.create({
        data: { firstName: r.firstName, lastName: r.lastName, ...data },
      });
      playerId = p.id;
      created++;
    }

    // Optional stat line.
    if (r.season && (r.points !== undefined || r.minutes !== undefined)) {
      const line = {
        points: num(r.points), rebounds: num(r.rebounds), assists: num(r.assists),
        steals: num(r.steals), blocks: num(r.blocks), turnovers: num(r.turnovers),
      };
      const fp = computeFantasyPoints(line);
      await prisma.playerSeasonStat.upsert({
        where: { playerId_season: { playerId, season: r.season } },
        create: {
          playerId, season: r.season, teamSnapshot: r.teamShort ?? null,
          games: num(r.games, 30), minutes: num(r.minutes), ...line,
          usage: num(r.usage), pir: num(r.pir), fantasyPoints: Math.round(fp * 10) / 10,
          fpStdev: Math.round(fp * 0.34 * 10) / 10,
        },
        update: {
          minutes: num(r.minutes), ...line, usage: num(r.usage), pir: num(r.pir),
          fantasyPoints: Math.round(fp * 10) / 10,
        },
      });
      stats++;
    }
  }

  return NextResponse.json({ ok: true, created, updated, stats });
}

function parseCsv(text: string): any[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const obj: any = {};
    headers.forEach((h, i) => (obj[h] = cells[i]));
    return obj;
  });
}
