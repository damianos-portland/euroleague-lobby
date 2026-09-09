// ---------------------------------------------------------------------------
// Web Push (VAPID) sending. Server-only. Sends a JSON payload to every browser
// endpoint a user has subscribed, and self-heals by pruning dead endpoints.
// ---------------------------------------------------------------------------

import webpush from "web-push";
import { prisma } from "./db";

const PUBLIC = process.env.VAPID_PUBLIC_KEY;
const PRIVATE = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@euroleaguelobby.dev";

// Configured lazily on first use so a missing key never crashes app boot —
// push is best-effort and must never break the draft flow.
let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!PUBLIC || !PRIVATE) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

// Fire a notification to all of a user's devices. Never throws — a failed or
// expired endpoint (404/410) is deleted; anything else is swallowed.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
      } catch (err: any) {
        const code = err?.statusCode;
        if (code === 404 || code === 410) {
          // Endpoint is gone (unsubscribed / expired) — drop it.
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        }
      }
    })
  );
}
