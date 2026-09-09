import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { AUTH_CHALLENGE_COOKIE, rpFromHeaders } from "@/lib/webauthn";

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
  // Passwordless sign-in with a WebAuthn passkey. The client sends the assertion
  // JSON; we verify it against the challenge cookie set by /api/passkey/login/
  // options and the passkey's stored public key.
  Credentials({
    id: "passkey",
    name: "passkey",
    credentials: { assertion: {} },
    async authorize(creds) {
      let assertion: any;
      try {
        assertion = JSON.parse(String(creds?.assertion ?? "null"));
      } catch {
        return null;
      }
      if (!assertion?.id) return null;

      const expectedChallenge = cookies().get(AUTH_CHALLENGE_COOKIE)?.value;
      if (!expectedChallenge) return null;
      const { rpID, origin } = rpFromHeaders(headers());

      const authr = await prisma.authenticator.findUnique({ where: { credentialID: assertion.id } });
      if (!authr) return null;

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: assertion,
          expectedChallenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          requireUserVerification: false,
          authenticator: {
            credentialID: isoBase64URL.toBuffer(authr.credentialID),
            credentialPublicKey: new Uint8Array(authr.publicKey),
            counter: authr.counter,
            transports: authr.transports ? (authr.transports.split(",") as any) : undefined,
          },
        });
      } catch {
        return null;
      }
      if (!verification.verified) return null;

      // Advance the signature counter (clone-detection) and burn the challenge.
      await prisma.authenticator.update({
        where: { id: authr.id },
        data: { counter: verification.authenticationInfo.newCounter },
      });
      cookies().set(AUTH_CHALLENGE_COOKIE, "", { path: "/", maxAge: 0 });

      const user = await prisma.user.findUnique({ where: { id: authr.userId } });
      if (!user) return null;
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
