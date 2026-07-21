import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "EuroLeague Lobby — Fantasy & Draft 2026",
  description:
    "Premium EuroLeague fantasy analytics: rosters, projections, fantasy value engine and live snake draft for the 2025-26 season.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <Sidebar />
        <main className="md:pl-64">
          <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </body>
    </html>
  );
}
