"use client";

import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

// VAPID public key must be base64url → Uint8Array for applicationServerKey.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  // Back it with a concrete ArrayBuffer so it satisfies BufferSource typing.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "loading" | "unsupported" | "blocked" | "off" | "on";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// Detect iOS Safari that hasn't been installed to the home screen — push is
// impossible there until the user does "Add to Home Screen".
function iosNeedsInstall(): boolean {
  if (typeof window === "undefined") return false;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true;
  return isIOS && !standalone;
}

export function PushToggle({ className = "" }: { className?: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setNeedsInstall(iosNeedsInstall());
      const supported =
        "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported || !VAPID_PUBLIC) {
        if (!cancelled) setState("unsupported");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        if (Notification.permission === "denied") {
          if (!cancelled) setState("blocked");
          return;
        }
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) setState(existing ? "on" : "off");
      } catch {
        if (!cancelled) setState("unsupported");
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (busy) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC!) as BufferSource,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      setState(res.ok ? "on" : "off");
    } catch {
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      /* leave state as-is */
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;

  if (state === "unsupported") {
    if (needsInstall) {
      return (
        <div className={`chip bg-white/5 text-slate-400 ${className}`} title="iOS">
          <Bell size={14} /> Πρόσθεσέ με στην αρχική οθόνη για ειδοποιήσεις
        </div>
      );
    }
    return null;
  }

  if (state === "blocked") {
    return (
      <div className={`chip bg-white/5 text-slate-400 ${className}`} title="Ξεμπλόκαρε τις ειδοποιήσεις στις ρυθμίσεις του browser">
        <BellOff size={14} /> Ειδοποιήσεις μπλοκαρισμένες
      </div>
    );
  }

  if (state === "on") {
    return (
      <button
        onClick={disable}
        disabled={busy}
        className={`btn-ghost !py-1.5 text-xs ${className}`}
        title="Απενεργοποίηση ειδοποιήσεων"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <BellRing size={14} className="text-brand-400" />}
        Ειδοποιήσεις ενεργές
      </button>
    );
  }

  // state === "off"
  return (
    <>
      <button
        onClick={enable}
        disabled={busy}
        className={`btn-primary !py-1.5 text-xs ${className}`}
        title="Ενεργοποίηση ειδοποιήσεων για τη σειρά σου"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
        Ενεργοποίησε ειδοποιήσεις
      </button>
      {needsInstall && (
        <span className="text-[11px] text-slate-500">iPhone: Κοινή χρήση → «Στην αρχική οθόνη»</span>
      )}
    </>
  );
}
