import { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
  status,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  status?: string; // mono terminal-style line, e.g. "● LIVE · OFFSEASON 2026-27"
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {status && (
          <div className="mb-1 font-mono text-[10px] font-semibold tracking-wider text-emerald-400">{status}</div>
        )}
        <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
