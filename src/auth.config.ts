import type { NextAuthConfig } from "next-auth";

// Edge-safe config (no DB / bcrypt imports) — used by middleware for route
// protection. The full provider config with DB access lives in ./auth.ts.
export const authConfig = {
  pages: { signIn: "/login" },
  providers: [], // real providers are added in auth.ts
  callbacks: {
    // Gate every route behind login except the auth pages/endpoints.
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isPublic =
        pathname === "/login" ||
        pathname === "/signup" ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/signup");
      if (isPublic) return true;
      return !!auth?.user; // false → NextAuth redirects to signIn page
    },
  },
} satisfies NextAuthConfig;
