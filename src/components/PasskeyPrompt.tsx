"use client";

import { KeyRound, Loader2, X } from "lucide-react";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const DISMISS_KEY = "pk_prompt_dismissed";

function guessDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iphone/i.test(ua)) return "iPhone";
  if (/ipad/i.test(ua)) return "iPad";
  if (/android/i.test(ua)) return "Android";
  if (/mac/i.test(ua)) return "Mac";
  if (/windows/i.test(ua)) return "Windows";
  return "Passkey";
}

// A gentle, one-time nudge shown after login to set up a passkey. Appears only
// when: the browser supports passkeys, the user has none yet, and they haven't
// dismissed it before. Never shown on /settings (they can manage it there).
export function PasskeyPrompt() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (pathname?.startsWith("/settings")) return;
    if (!browserSupportsWebAuthn()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/passkey");
        if (!res.ok) return; // unauthenticated or error → stay hidden
        const { passkeys } = await res.json();
        if (!cancelled && Array.isArray(passkeys) && passkeys.length === 0) setShow(true);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once on first mount; localStorage guards against re-showing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  async function enable() {
    setBusy(true);
    try {
      const optRes = await fetch("/api/passkey/register/options", { method: "POST" });
      if (!optRes.ok) throw new Error("options");
      const options = await optRes.json();
      const attestation = await startRegistration(options);
      const verRes = await fetch("/api/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attestation, deviceName: guessDeviceName() }),
      });
      if (!verRes.ok) throw new Error("verify");
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
      setDone(true);
      setTimeout(() => setShow(false), 2200);
    } catch (e: any) {
      // Cancelled the native prompt → leave the banner so they can retry.
      setBusy(false);
    }
  }

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center p-4">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-ink-850 p-3 shadow-2xl">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500/15">
          <KeyRound size={18} className="text-brand-400" />
        </div>
        {done ? (
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-emerald-300">Το passkey ενεργοποιήθηκε ✅</div>
            <div className="text-xs text-slate-400">Την επόμενη φορά μπες με ένα άγγιγμα.</div>
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-white">Σύνδεση χωρίς κωδικό;</div>
              <div className="text-xs text-slate-400">Ενεργοποίησε passkey (Face ID / Touch ID) — πιο γρήγορο & ασφαλές.</div>
            </div>
            <button onClick={enable} disabled={busy} className="btn-primary shrink-0 !py-1.5 text-xs">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
              Ενεργοποίηση
            </button>
            <button onClick={dismiss} className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:text-slate-300" aria-label="Όχι τώρα">
              <X size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
