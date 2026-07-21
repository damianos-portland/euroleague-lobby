import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // EuroLeague-inspired dark palette
        ink: {
          950: "#070912",
          900: "#0b0f1c",
          850: "#0f1424",
          800: "#141a2e",
          750: "#1a2138",
          700: "#222b45",
          600: "#2e3a5c",
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
      },
      animation: {
        pulseRing: "pulseRing 1.6s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
