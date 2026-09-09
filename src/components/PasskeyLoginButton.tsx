"use client";

import { KeyRound } from "lucide-react";
import { signIn } from "next-auth/react";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { useEffect, useState } from "react";

// "Sign in with a passkey" — usernameless: the browser offers any discoverable
// passkey registered for this site, then we hand the assertion to NextAuth.
export function PasskeyLoginButton() {
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
  }, []);

  if (!supported) return null;

  async function login() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/passkey/login/options", { method: "POST" });
      if (!res.ok) throw new Error("options");
      const options = await res.json();
      const assertion = await startAuthentication(options);
      const result = await signIn("passkey", {
        assertion: JSON.stringify(assertion),
        redirect: false,
      });
      if (result?.error) {
        setError("Το passkey δεν αναγνωρίστηκε.");
        setBusy(false);
        return;
      }
      window.location.href = "/";
    } catch (e: any) {
      // User cancelled the native prompt → stay quiet; otherwise show a hint.
      if (e?.name !== "NotAllowedError" && e?.name !== "AbortError") {
        setError("Δεν βρέθηκε passkey σε αυτή τη συσκευή.");
      }
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={login} disabled={busy} className="btn-ghost w-full justify-center">
        <KeyRound size={16} /> {busy ? "Άνοιγμα…" : "Σύνδεση με passkey"}
      </button>
      {error && <p className="mt-2 text-center text-xs text-rose-400">{error}</p>}
    </div>
  );
}
