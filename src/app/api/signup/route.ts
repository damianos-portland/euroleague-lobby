import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

// Open self-signup: creates a role="user" account with a bcrypt-hashed password.
export async function POST(req: NextRequest) {
  const { email, name, password } = await req.json().catch(() => ({}));
  const cleanEmail = String(email ?? "").toLowerCase().trim();
  const cleanName = String(name ?? "").trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
    return NextResponse.json({ error: "Μη έγκυρο email." }, { status: 400 });
  }
  if (!cleanName) {
    return NextResponse.json({ error: "Το όνομα είναι υποχρεωτικό." }, { status: 400 });
  }
  if (String(password ?? "").length < 8) {
    return NextResponse.json({ error: "Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
  if (existing) {
    return NextResponse.json({ error: "Υπάρχει ήδη λογαριασμός με αυτό το email." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  await prisma.user.create({
    data: { email: cleanEmail, name: cleanName, role: "user", passwordHash },
  });

  return NextResponse.json({ ok: true });
}
