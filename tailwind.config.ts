import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Neutrals are CSS-variable-backed so the whole app flips between the
        // dark (default) and light themes without touching component classes.
        // `white` = the primary foreground token (dark text in light theme), so
        // text-white / bg-white/[opacity] / border-white/[opacity] all adapt.
        white: "rgb(var(--fg) / <alpha-value>)",
        slate: {
          50: "rgb(var(--slate-50) / <alpha-value>)",
          100: "rgb(var(--slate-100) / <alpha-value>)",
          200: "rgb(var(--slate-200) / <alpha-value>)",
          300: "rgb(var(--slate-300) / <alpha-value>)",
          400: "rgb(var(--slate-400) / <alpha-value>)",
          500: "rgb(var(--slate-500) / <alpha-value>)",
          600: "rgb(var(--slate-600) / <alpha-value>)",
          700: "rgb(var(--slate-700) / <alpha-value>)",
          800: "rgb(var(--slate-800) / <alpha-value>)",
          900: "rgb(var(--slate-900) / <alpha-value>)",
        },
        ink: {
          950: "rgb(var(--ink-950) / <alpha-value>)",
          900: "rgb(var(--ink-900) / <alpha-value>)",
          850: "rgb(var(--ink-850) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          750: "rgb(var(--ink-750) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
          600: "rgb(var(--ink-600) / <alpha-value>)",
        },
        brand: {
          DEFAULT: "#ff5a1f", // EuroLeague orange
          50: "#fff3ed",
          400: "#ff7a47",
          500: "#ff5a1f",
          600: "#e6470f",
        },
        accent: {
          DEFAULT: "#3b82f6",
          cyan: "#22d3ee",
          violet: "#8b5cf6",
        },
        good: "#22c55e",
        warn: "#f59e0b",
        bad: "#ef4444",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.7)",
        glow: "0 0 0 1px rgba(255,90,31,0.35), 0 8px 30px -8px rgba(255,90,31,0.25)",
      },
      keyframes: {
        pulseRing: {
          "0%,100%": { boxShadow: "0 0 0 0 rgba(255,90,31,0.5)" },
          "50%": { boxShadow: "0 0 0 8px rgba(255,90,31,0)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        pulseRing: "pulseRing 1.6s ease-out infinite",
        marquee: "marquee 45s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
