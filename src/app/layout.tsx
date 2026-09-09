import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { auth } from "@/auth";

const inter = Inter({ subsets: ["latin", "greek"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin", "greek"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "EuroLeague Lobby — Fantasy & Draft 2026",
  description:
    "Premium EuroLeague fantasy analytics: rosters, projections, fantasy value engine and live snake draft.",
  // iOS PWA: enables "Add to Home Screen" as a standalone app (prerequisite for
  // web push on iPhone) and sets the home-screen icon.
  appleWebApp: { capable: true, title: "EL Lobby", statusBarStyle: "black-translucent" },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user
    ? {
        name: session.user.name ?? session.user.email ?? "User",
        email: session.user.email ?? "",
        role: session.user.role,
      }
    : null;

  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Set the theme before first paint so there's no dark→light flash.
            Dark is the default identity; only a saved "light" choice flips it. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');document.documentElement.dataset.theme=(t==='light')?'light':'dark';}catch(e){document.documentElement.dataset.theme='dark';}})();",
          }}
        />
      </head>
      <body className="min-h-screen font-sans antialiased">
        {user ? (
          <>
            <Sidebar user={user} />
            <main className="md:pl-64">
              <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
            </main>
          </>
        ) : (
          // Unauthenticated: only /login and /signup render here (middleware
          // redirects everything else). No sidebar, no page chrome.
          <main>{children}</main>
        )}
      </body>
    </html>
  );
}
