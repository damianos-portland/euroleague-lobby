import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { REG_CHALLENGE_COOKIE, rpFromHeaders } from "@/lib/webauthn";

export const runtime = "nodejs";

// Step 2: verify the attestation the browser produced and persist the passkey.
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const attestation = body?.attestation;
  const deviceName: string | null = body?.deviceName ? String(body.deviceName).slice(0, 60) : null;

  const jar = cookies();
  const expectedChallenge = jar.get(REG_CHALLENGE_COOKIE)?.value;
  if (!attestation || !expectedChallenge) {
    return NextResponse.json({ error: "Λείπει το challenge — δοκίμασε ξανά." }, { status: 400 });
  }

  const { rpID, origin } = rpFromHeaders(req.headers);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: attestation,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Verification failed" }, { status: 400 });
  }

  jar.set(REG_CHALLENGE_COOKIE, "", { path: "/", maxAge: 0 });

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Δεν επαληθεύτηκε το passkey." }, { status: 400 });
  }

  const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
  const credIdB64 = isoBase64URL.fromBuffer(credentialID);
  const transports: string[] | undefined = attestation?.response?.transports;

  await prisma.authenticator.upsert({
    where: { credentialID: credIdB64 },
    create: {
      userId,
      credentialID: credIdB64,
      publicKey: Buffer.from(credentialPublicKey),
      counter,
      transports: transports?.join(",") ?? null,
      deviceName,
    },
    update: { counter, userId },
  });

  const count = await prisma.authenticator.count({ where: { userId } });
  return NextResponse.json({ ok: true, count });
}
