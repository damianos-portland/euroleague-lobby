import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

// Save (POST) or remove (DELETE) a browser push subscription for the CURRENT
// user. The subscription object comes from PushManager.subscribe() on the
// client. Keyed by endpoint so re-subscribing the same device upserts.
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const sub = body?.subscription;
  const endpoint: string | undefined = sub?.endpoint;
  const p256dh: string | undefined = sub?.keys?.p256dh;
  const authKey: string | undefined = sub?.keys?.auth;
  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }

  const ua = req.headers.get("user-agent")?.slice(0, 255) ?? null;

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh, auth: authKey, ua },
    // Re-point the endpoint at the current user + refresh keys.
    update: { userId, p256dh, auth: authKey, ua },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const endpoint: string | undefined = body?.endpoint;
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });

  // Only delete the caller's own endpoint.
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
  return NextResponse.json({ ok: true });
}
