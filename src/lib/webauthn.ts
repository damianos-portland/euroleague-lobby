// ---------------------------------------------------------------------------
// Shared WebAuthn (passkey) config. The Relying Party ID + expected origin are
// derived from the incoming request so the same code works on localhost and on
// whatever domain the app is deployed to — no env needed.
// ---------------------------------------------------------------------------

export const RP_NAME = "EuroLeague Lobby";

// Short-lived cookies that carry the server-issued challenge between the
// "options" request and the "verify" request.
export const REG_CHALLENGE_COOKIE = "pk_reg_challenge";
export const AUTH_CHALLENGE_COOKIE = "pk_auth_challenge";

// rpID is the host WITHOUT the port (WebAuthn spec); origin is the full URL.
export function rpFromHeaders(h: Headers): { rpID: string; origin: string; secure: boolean } {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const isLocal = host.startsWith("localhost") || host.startsWith("127.");
  const proto = h.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  const rpID = host.split(":")[0];
  const origin = `${proto}://${host}`;
  return { rpID, origin, secure: proto === "https" };
}
