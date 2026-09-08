"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "dark" | "light";

// Reads the theme the no-flash script (in layout.tsx) already stamped on <html>,
// then lets the user flip it and persists the choice to localStorage.
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current = (document.documentElement.dataset.theme as Theme) || "dark";
    setTheme(current);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode / storage disabled — theme just won't persist */
    }
    setTheme(next);
  }

  return (
    <button
      onClick={toggle}
      className={`btn-ghost justify-center !py-1.5 text-xs ${className}`}
      title="Εναλλαγή θέματος"
      aria-label="Εναλλαγή φωτεινού / σκοτεινού θέματος"
    >
      {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
      {theme === "dark" ? "Φωτεινό" : "Σκοτεινό"}
    </button>
  );
}
