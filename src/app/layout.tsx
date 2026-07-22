import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin", "greek"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin", "greek"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "EuroLeague Lobby — Fantasy & Draft 2026",
  description:
    "Premium EuroLeague fantasy analytics: rosters, projections, fantasy value engine and live snake draft.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <Sidebar />
        <main className="md:pl-64">
          <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </body>
    </html>
  );
}
