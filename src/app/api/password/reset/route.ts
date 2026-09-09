import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// Complete a password reset: verify the (hashed) token is valid, unused and
// unexpired, then set the new bcrypt-hashed password and burn the token.
export async function POST(req: NextRequest) {
  const { token, password } = await req.json().catch(() => ({}));
  const raw = String(token ?? "");
  const pw = String(password ?? "");

  if (!raw) return NextResponse.json({ error: "Λείπει το token." }, { status: 400 });
  if (pw.length < 8) {
    return NextResponse.json({ error: "Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες." }, { status: 400 });
  }

  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(raw) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json({ error: "Ο σύνδεσμος είναι άκυρος ή έληξε. Ζήτησε νέο." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(pw, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Kill any other outstanding tokens for this user.
    prisma.passwordResetToken.deleteMany({ where: { userId: record.userId, usedAt: null } }),
  ]);

  return NextResponse.json({ ok: true });
}
