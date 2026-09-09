import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { RP_NAME, REG_CHALLENGE_COOKIE, rpFromHeaders } from "@/lib/webauthn";

export const runtime = "nodejs";

// Step 1 of adding a passkey (user must be logged in): issue creation options
// and stash the challenge in a short-lived cookie for the verify step.
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.authenticator.findMany({ where: { userId } });
  const { rpID, secure } = rpFromHeaders(req.headers);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: user.id,
    userName: user.email,
    userDisplayName: user.name,
    attestationType: "none",
    excludeCredentials: existing.map((a) => ({
      id: isoBase64URL.toBuffer(a.credentialID),
      type: "public-key" as const,
      transports: a.transports ? (a.transports.split(",") as any) : undefined,
    })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });

  cookies().set(REG_CHALLENGE_COOKIE, options.challenge, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });

  return NextResponse.json(options);
}
