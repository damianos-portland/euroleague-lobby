import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// Build the app's public origin from the incoming request (works on Vercel
// behind the proxy), falling back to an env override for cron/other contexts.
function originFrom(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return `${proto}://${host}`;
}

function resetEmailHtml(link: string): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
    <div style="font-weight:900;font-size:20px;color:#ff5a1f">EuroLeague Lobby</div>
    <h2 style="font-size:18px;margin:16px 0 8px">Επαναφορά κωδικού</h2>
    <p style="font-size:14px;line-height:1.5;color:#334155">
      Ζητήθηκε επαναφορά κωδικού για τον λογαριασμό σου. Πάτησε το κουμπί για να ορίσεις νέο κωδικό.
      Ο σύνδεσμος λήγει σε 1 ώρα.
    </p>
    <p style="margin:24px 0">
      <a href="${link}" style="background:#ff5a1f;color:#fff;text-decoration:none;font-weight:700;
        padding:12px 20px;border-radius:12px;display:inline-block;font-size:14px">Όρισε νέο κωδικό</a>
    </p>
    <p style="font-size:12px;color:#64748b;line-height:1.5">
      Αν δεν το ζήτησες εσύ, αγνόησε αυτό το email — ο κωδικός σου παραμένει ίδιος.<br>
      Ή αντέγραψε τον σύνδεσμο: <br><span style="color:#334155;word-break:break-all">${link}</span>
    </p>
  </div>`;
}

// Start a password reset. ALWAYS responds 200 with a generic message so an
// attacker can't probe which emails have accounts (no user enumeration).
export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  const cleanEmail = String(email ?? "").toLowerCase().trim();

  const generic = NextResponse.json({ ok: true });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) return generic;

  const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
  if (!user) return generic; // don't reveal non-existence

  // Invalidate any earlier outstanding tokens for this user, then mint one.
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });

  const raw = crypto.randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
  });

  const link = `${originFrom(req)}/reset?token=${raw}`;
  await sendEmail({
    to: cleanEmail,
    subject: "Επαναφορά κωδικού — EuroLeague Lobby",
    html: resetEmailHtml(link),
    text: `Επαναφορά κωδικού: ${link} (λήγει σε 1 ώρα)`,
  });

  return generic;
}
