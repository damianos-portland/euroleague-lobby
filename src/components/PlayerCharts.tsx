"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";

export function ProductionRadar({
  last,
  proj,
}: {
  last: { points: number; rebounds: number; assists: number; steals: number; blocks: number; pir: number } | null;
  proj: { projPoints: number; projRebounds: number; projAssists: number; projSteals: number; projBlocks: number; projPir: number } | null;
}) {
  // Normalise each axis to a rough 0-100 scale for shape comparison.
  const norm = (v: number, max: number) => Math.min(100, (v / max) * 100);
  const data = [
    { cat: "PTS", last: norm(last?.points ?? 0, 22), proj: norm(proj?.projPoints ?? 0, 22) },
    { cat: "REB", last: norm(last?.rebounds ?? 0, 9), proj: norm(proj?.projRebounds ?? 0, 9) },
    { cat: "AST", last: norm(last?.assists ?? 0, 7), proj: norm(proj?.projAssists ?? 0, 7) },
    { cat: "STL", last: norm(last?.steals ?? 0, 2), proj: norm(proj?.projSteals ?? 0, 2) },
    { cat: "BLK", last: norm(last?.blocks ?? 0, 2), proj: norm(proj?.projBlocks ?? 0, 2) },
    { cat: "PIR", last: norm(last?.pir ?? 0, 22), proj: norm(proj?.projPir ?? 0, 22) },
  ];
  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="rgba(255,255,255,0.08)" />
        <PolarAngleAxis dataKey="cat" tick={{ fill: "#94a3b8", fontSize: 11 }} />
        <Radar name="2024-25" dataKey="last" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.18} />
        <Radar name="Proj 25-26" dataKey="proj" stroke="#ff5a1f" fill="#ff5a1f" fillOpacity={0.28} />
        <Tooltip
          contentStyle={{ background: "#0f1424", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
          formatter={(v: number) => `${Math.round(v)}`}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export function ValueBars({
  metrics,
}: {
  metrics: { name: string; value: number }[];
}) {
  const color = (v: number) => (v >= 65 ? "#22c55e" : v >= 50 ? "#3b82f6" : v >= 38 ? "#f59e0b" : "#ef4444");
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={metrics} layout="vertical" margin={{ left: 10, right: 16 }}>
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis type="category" dataKey="name" width={92} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={{ background: "#0f1424", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
        />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={16}>
          {metrics.map((m, i) => (
            <Cell key={i} fill={color(m.value)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
