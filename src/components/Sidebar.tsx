"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
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
} from "lucide-react";
import { useState } from "react";

const NAV = [
  { href: "/", label: "Lobby", icon: LayoutDashboard },
  { href: "/teams", label: "Teams", icon: Shield },
  { href: "/players", label: "Players", icon: Users },
  { href: "/projections", label: "Projections", icon: LineChart },
  { href: "/value", label: "Value Engine", icon: Gauge },
  { href: "/draft", label: "Draft Mode 2026", icon: Trophy },
  { href: "/admin", label: "Admin", icon: BarChart3 },
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
        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={clsx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                isActive(href)
                  ? "bg-brand-500/15 text-white ring-1 ring-brand-500/30"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
              )}
            >
              <Icon size={18} className={isActive(href) ? "text-brand-400" : ""} />
              {label}
            </Link>
          ))}
        </nav>

        <div className="absolute inset-x-4 bottom-4 rounded-xl border border-white/5 bg-white/[0.03] p-3 text-xs text-slate-400">
          <div className="font-semibold text-slate-200">Season 2025-26</div>
          Preseason · rosters in flux. Data refreshes continuously.
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
