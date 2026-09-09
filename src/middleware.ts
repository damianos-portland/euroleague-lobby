import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge middleware: uses the DB-free config to gate every route behind login
// (the `authorized` callback in auth.config.ts). Role checks happen in the
// individual server components / API routes.
export default NextAuth(authConfig).auth;

export const config = {
  // Run on everything except Next internals, static asset files, and the
  // PWA/push essentials (service worker + manifest) which MUST be publicly
  // fetchable for notifications to register.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)",
  ],
};
