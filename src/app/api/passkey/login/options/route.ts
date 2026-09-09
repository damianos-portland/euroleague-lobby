import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { AUTH_CHALLENGE_COOKIE, rpFromHeaders } from "@/lib/webauthn";

export const runtime = "nodejs";

// Passwordless login step 1 (PUBLIC): issue authentication options. We omit
// allowCredentials so the browser offers any discoverable passkey for this site
// (usernameless). The challenge is stashed for the sign-in verify step.
export async function POST(req: NextRequest) {
  const { rpID, secure } = rpFromHeaders(req.headers);

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
  });

  cookies().set(AUTH_CHALLENGE_COOKIE, options.challenge, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });

  return NextResponse.json(options);
}
