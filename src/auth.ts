import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";

// Build the provider list. Google is added only when its env credentials are
// present, so email+password works out of the box and Google lights up later.
const providers: any[] = [
  Credentials({
    name: "credentials",
    credentials: { email: {}, password: {} },
    async authorize(creds) {
      const email = String(creds?.email ?? "").toLowerCase().trim();
      const password = String(creds?.password ?? "");
      if (!email || !password) return null;
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user?.passwordHash) return null;
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return null;
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        image: user.image ?? undefined,
      };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true, // link Google to an existing email account
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true, // self-hosted / behind a proxy (Vercel auto-trusts anyway)
  session: { strategy: "jwt" },
  providers,
  callbacks: {
    ...authConfig.callbacks,
    // Ensure a Google sign-in has a User row (with a role) in our own table.
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        const email = user.email.toLowerCase();
        const existing = await prisma.user.findUnique({ where: { email } });
        if (!existing) {
          await prisma.user.create({
            data: { email, name: user.name ?? email, role: "user", image: (user as any).image ?? null },
          });
        }
      }
      return true;
    },
    // Load id + role from the DB so role changes (promotions) take effect.
    async jwt({ token, user }) {
      const email = (user?.email ?? token.email)?.toLowerCase();
      if (email) {
        const db = await prisma.user.findUnique({
          where: { email },
          select: { id: true, role: true },
        });
        if (db) {
          token.uid = db.id;
          token.role = db.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? "";
        session.user.role = (token.role as string) ?? "user";
      }
      return session;
    },
  },
});
