import type { MetadataRoute } from "next";

// Web App Manifest — makes the app installable ("Add to Home Screen"), which is
// REQUIRED on iOS for web push to work at all. Next serves this at
// /manifest.webmanifest and links it automatically.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EuroLeague Lobby",
    short_name: "EL Lobby",
    description: "Fantasy & Draft 2026 — projections, value engine, live snake draft.",
    start_url: "/",
    display: "standalone",
    background_color: "#080b12",
    theme_color: "#080b12",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
