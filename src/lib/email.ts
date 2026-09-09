// ---------------------------------------------------------------------------
// Transactional email via Resend's REST API (no SDK — keeps deps light).
// Server-only. Returns true on success; on any failure it logs and returns
// false so callers can degrade gracefully (e.g. still respond 200 to the user).
// ---------------------------------------------------------------------------

const RESEND_ENDPOINT = "https://api.resend.com/emails";

// Resend's shared sender works with NO domain setup, but only delivers to the
// Resend account owner's own address — fine for testing. Verify a domain and
// set RESEND_FROM to send to real users.
const DEFAULT_FROM = "EuroLeague Lobby <onboarding@resend.dev>";

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || DEFAULT_FROM;

  if (!key) {
    // No provider configured yet — don't throw, just make it visible in logs.
    console.warn(`[email] RESEND_API_KEY missing — skipped sending "${opts.subject}" to ${opts.to}`);
    return false;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[email] Resend failed ${res.status}: ${detail}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] send error", err);
    return false;
  }
}
