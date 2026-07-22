"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  LineChart,
  Trophy,
  Shield,
  Gauge,
  Menu,
  X,
  Newspaper,
  HardHat,
  Wallet,
} from "lucide-react";
import { useState } from "react";

const NAV: { group: string; items: { href: string; label: string; icon: LucideIcon }[] }[] = [
  {
    group: "Market",
    items: [
      { href: "/", label: "Lobby", icon: LayoutDashboard },
      { href: "/projections", label: "Projections", icon: LineChart },
      { href: "/value", label: "Value Engine", icon: Gauge },
    ],
  },
  {
    group: "Offseason",
    items: [
      { href: "/rumors", label: "Rumor Mill", icon: Newspaper },
      { href: "/roster-race", label: "Roster Race", icon: HardHat },
      { href: "/budgets", label: "Budgets", icon: Wallet },
    ],
  },
  {
    group: "League",
    items: [
      { href: "/teams", label: "Teams", icon: Shield },
      { href: "/players", label: "Players", icon: Users },
    ],
  },
  {
    group: "",
    items: [
      { href: "/draft", label: "Draft Mode 2026", icon: Trophy },
      { href: "/admin", label: "Admin", icon: BarChart3 },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-white/5 bg-ink-950/80 px-4 py-3 backdrop-blur md:hidden">
        <Brand />
        <button className="btn-ghost !p-2" onClick={() => setOpen((v) => !v)} aria-label="Menu">
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 w-64 transform border-r border-white/5 bg-ink-900/95 p-4 backdrop-blur transition-transform md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="mb-6 hidden md:block">
          <Brand />
        </div>
        <nav className="flex max-h-[calc(100vh-96px)] flex-col gap-4 overflow-y-auto pb-24">
          {NAV.map(({ group, items }) => (
            <div key={group || "misc"}>
              {group && <div className="section-title mb-1.5 px-3">{group}</div>}
              <div className="flex flex-col gap-1">
                {items.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={clsx(
                      "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                      isActive(href)
                        ? "bg-brand-500/15 text-white ring-1 ring-brand-500/30"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                    )}
                  >
                    <Icon size={17} className={isActive(href) ? "text-brand-400" : ""} />
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="absolute inset-x-4 bottom-4 rounded-xl border border-white/5 bg-white/[0.03] p-3 font-mono text-[10px] text-slate-400">
          <div className="font-bold text-emerald-400"><span aria-hidden="true">● </span>OFFSEASON 2026-27</div>
          Καθημερινό refresh 06:00 UTC — stats, rosters, news.
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 font-black text-white shadow-glow">
        EL
      </div>
      <div className="leading-tight">
        <div className="text-sm font-extrabold tracking-tight text-white">EuroLeague Lobby</div>
        <div className="text-[10px] uppercase tracking-widest text-brand-400">Fantasy · Draft 2026</div>
      </div>
    </Link>
  );
}
