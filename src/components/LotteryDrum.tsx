"use client";

import { useEffect, useRef, useState } from "react";

export interface DrumTeam {
  id: string;
  name: string;
  weight: number;
  color: string;
}

export interface DrumReveal {
  id: string;
  name: string;
  pick: number;
  color: string;
}

interface Ball {
  teamId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  label: string;
  state: "in" | "ejecting" | "gone";
  t: number; // ejection progress 0..1
}

// Internal (logical) canvas resolution — scaled to fit via CSS.
const W = 460;
const H = 480;
const CX = W / 2;
const CY = H / 2 - 12;
const WALL = 196; // inner glass radius
const EXIT_X = CX;
const EXIT_Y = CY - WALL - 6; // top opening

const TOTAL_BALLS = 58; // budget distributed across teams by weight

function shortLabel(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function LotteryDrum({
  teams,
  activeIds,
  latest,
  spinning,
}: {
  teams: DrumTeam[];
  activeIds: string[];
  latest: DrumReveal | null;
  spinning: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ballsRef = useRef<Ball[]>([]);
  const rafRef = useRef<number>(0);
  const spinRef = useRef(spinning);
  const teamsRef = useRef(teams);
  teamsRef.current = teams;
  spinRef.current = spinning;

  const [flash, setFlash] = useState(0);
  const prevLatest = useRef<string | null>(null);

  // Ball budget per team, proportional to weight (min 1).
  function countFor(weight: number): number {
    const totalW = teamsRef.current.reduce((s, t) => s + Math.max(1, t.weight), 0) || 1;
    return Math.max(1, Math.round((Math.max(1, weight) / totalW) * TOTAL_BALLS));
  }

  function ballRadius(): number {
    const total = teamsRef.current.reduce((s, t) => s + countFor(t.weight), 0);
    const drumArea = Math.PI * WALL * WALL;
    return Math.max(9, Math.min(19, Math.sqrt((drumArea * 0.34) / (Math.PI * Math.max(1, total)))));
  }

  // Reconcile the ball set to the currently-active teams.
  // - teams in `activeIds` with no balls → spawn their allotment
  // - teams that left the active set → eject one ball (the "winner"), drop the rest
  // - a full active set (reset) → wipe leftovers and refill
  useEffect(() => {
    const active = new Set(activeIds);
    const teamById = new Map(teamsRef.current.map((t) => [t.id, t]));
    const isReset = active.size === teamsRef.current.length && teamsRef.current.length > 0;
    const rr = ballRadius();

    if (isReset) {
      // fresh drum — drop any ejecting/gone leftovers
      ballsRef.current = ballsRef.current.filter((b) => b.state === "in");
    }

    let balls = ballsRef.current;
    const presentIn = new Set(balls.filter((b) => b.state === "in").map((b) => b.teamId));

    // spawn balls for newly-active teams
    for (const id of active) {
      if (presentIn.has(id)) continue;
      const t = teamById.get(id);
      if (!t) continue;
      const n = countFor(t.weight);
      for (let k = 0; k < n; k++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = Math.random() * (WALL - rr - 8);
        balls.push({
          teamId: id,
          x: CX + Math.cos(ang) * rad,
          y: CY + Math.sin(ang) * rad,
          vx: (Math.random() - 0.5) * 5,
          vy: (Math.random() - 0.5) * 5,
          r: rr,
          color: t.color,
          label: shortLabel(t.name),
          state: "in",
          t: 0,
        });
      }
    }

    // eject balls whose team just left the active set
    const departed = [...presentIn].filter((id) => !active.has(id));
    for (const id of departed) {
      const own = balls.filter((b) => b.state === "in" && b.teamId === id);
      if (own.length === 0) continue;
      // the one nearest the exit becomes the winner that flies out
      own.sort((a, b) => Math.hypot(a.x - EXIT_X, a.y - EXIT_Y) - Math.hypot(b.x - EXIT_X, b.y - EXIT_Y));
      own[0].state = "ejecting";
      own[0].t = 0;
      for (let i = 1; i < own.length; i++) own[i].state = "gone";
    }

    ballsRef.current = balls;
  }, [activeIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // flash the chamber when a new pick is revealed
  useEffect(() => {
    if (latest && latest.id !== prevLatest.current) {
      prevLatest.current = latest.id;
      setFlash((f) => f + 1);
    }
    if (!latest) prevLatest.current = null;
  }, [latest]);

  // physics + render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    function step() {
      const balls = ballsRef.current.filter((b) => b.state !== "gone");
      ballsRef.current = balls;
      const boost = spinRef.current ? 1.9 : 1;

      for (const b of balls) {
        if (b.state === "ejecting") {
          b.t += 0.028;
          b.x += (EXIT_X - b.x) * 0.16;
          b.y += (EXIT_Y - 40 - b.y) * 0.16 * (0.5 + b.t);
          if (b.t >= 1 || b.y < EXIT_Y - 30) b.state = "gone";
          continue;
        }
        // air jets — random upward puffs, stronger while spinning
        if (Math.random() < 0.05 * boost) {
          b.vy -= (2 + Math.random() * 4) * boost;
          b.vx += (Math.random() - 0.5) * 3 * boost;
        }
        const depth = (b.y - CY) / WALL;
        if (depth > 0.25) b.vy -= 0.55 * depth * boost;
        b.vy += 0.22; // gravity
        b.vx *= 0.992;
        b.vy *= 0.992;
        b.x += b.vx;
        b.y += b.vy;
        // circular wall
        const dx = b.x - CX;
        const dy = b.y - CY;
        const d = Math.hypot(dx, dy) || 1;
        if (d + b.r > WALL) {
          const nx = dx / d;
          const ny = dy / d;
          b.x = CX + nx * (WALL - b.r);
          b.y = CY + ny * (WALL - b.r);
          const dot = b.vx * nx + b.vy * ny;
          b.vx -= 2 * dot * nx * 0.82;
          b.vy -= 2 * dot * ny * 0.82;
        }
      }

      // ball-ball collisions (elastic, equal mass)
      const inb = balls.filter((b) => b.state === "in");
      for (let i = 0; i < inb.length; i++) {
        for (let j = i + 1; j < inb.length; j++) {
          const a = inb[i];
          const c = inb[j];
          const dx = c.x - a.x;
          const dy = c.y - a.y;
          const d = Math.hypot(dx, dy);
          const min = a.r + c.r;
          if (d > 0 && d < min) {
            const nx = dx / d;
            const ny = dy / d;
            const overlap = (min - d) / 2;
            a.x -= nx * overlap;
            a.y -= ny * overlap;
            c.x += nx * overlap;
            c.y += ny * overlap;
            const p = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
            if (p < 0) {
              a.vx += p * nx;
              a.vy += p * ny;
              c.vx -= p * nx;
              c.vy -= p * ny;
            }
          }
        }
      }

      draw(ctx!, balls);
      rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "auto", aspectRatio: `${W} / ${H}` }}
        className="block"
      />
      {/* Result chamber */}
      <div
        key={flash}
        className="mx-auto -mt-2 w-full max-w-[300px] rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center shadow-lg"
        style={latest ? { boxShadow: `0 0 24px -6px ${latest.color}66`, borderColor: `${latest.color}55` } : undefined}
      >
        {latest ? (
          <div className="flex items-center justify-center gap-3">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-black text-slate-950"
              style={{ background: `radial-gradient(circle at 32% 28%, #fff9, ${latest.color})` }}
            >
              {latest.pick}
            </span>
            <div className="text-left">
              <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: latest.color }}>
                Pick #{latest.pick}
              </div>
              <div className="truncate text-base font-extrabold text-white">{latest.name}</div>
            </div>
          </div>
        ) : (
          <div className="py-1 font-mono text-xs uppercase tracking-widest text-slate-500">
            {spinning ? "…κλήρωση…" : "Θάλαμος κενός"}
          </div>
        )}
      </div>
    </div>
  );
}

function draw(ctx: CanvasRenderingContext2D, balls: Ball[]) {
  ctx.clearRect(0, 0, W, H);

  // exit tube
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.beginPath();
  ctx.roundRect(EXIT_X - 20, EXIT_Y - 46, 40, 60, 10);
  ctx.fill();

  // glass drum
  const g = ctx.createRadialGradient(CX - 60, CY - 70, 30, CX, CY, WALL + 30);
  g.addColorStop(0, "rgba(255,255,255,0.06)");
  g.addColorStop(0.6, "rgba(148,163,184,0.05)");
  g.addColorStop(1, "rgba(2,6,23,0.55)");
  ctx.beginPath();
  ctx.arc(CX, CY, WALL, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  // rim
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(148,163,184,0.28)";
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.beginPath();
  ctx.arc(CX, CY, WALL - 5, 0, Math.PI * 2);
  ctx.stroke();

  // base / blower
  ctx.fillStyle = "rgba(15,23,42,0.85)";
  ctx.beginPath();
  ctx.roundRect(CX - 70, CY + WALL - 18, 140, 40, 12);
  ctx.fill();

  // balls
  for (const b of balls) {
    const bg = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.15, b.x, b.y, b.r);
    bg.addColorStop(0, "rgba(255,255,255,0.95)");
    bg.addColorStop(0.25, b.color);
    bg.addColorStop(1, shade(b.color, -0.35));
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();
    // label
    if (b.r >= 11) {
      ctx.fillStyle = "rgba(15,23,42,0.9)";
      ctx.font = `700 ${Math.round(b.r * 0.72)}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.label, b.x, b.y + 0.5);
    }
  }

  // glass top highlight
  ctx.beginPath();
  ctx.ellipse(CX - 40, CY - WALL * 0.55, WALL * 0.42, WALL * 0.18, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fill();
}

// darken/lighten a hex color by amt (-1..1)
function shade(hex: string, amt: number): string {
  const m = hex.replace("#", "");
  const num = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amt < 0 ? v * amt : (255 - v) * amt))));
  r = f(r);
  g = f(g);
  b = f(b);
  return `rgb(${r},${g},${b})`;
}
