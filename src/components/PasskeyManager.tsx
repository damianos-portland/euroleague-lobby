"use client";

import { KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { useCallback, useEffect, useState } from "react";

type Passkey = { id: string; deviceName: string | null; transports: string | null; createdAt: string };

// Best-effort friendly label for the current device.
function guessDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iphone/i.test(ua)) return "iPhone";
  if (/ipad/i.test(ua)) return "iPad";
  if (/android/i.test(ua)) return "Android";
  if (/mac/i.test(ua)) return "Mac";
  if (/windows/i.test(ua)) return "Windows";
  return "Passkey";
}

export function PasskeyManager() {
  const [supported, setSupported] = useState(true);
  const [list, setList] = useState<Passkey[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/passkey");
    if (res.ok) setList((await res.json()).passkeys);
  }, []);

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
    load();
  }, [load]);

  async function add() {
    setBusy(true);
    setMsg(null);
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
      if (!verRes.ok) {
        const d = await verRes.json().catch(() => ({}));
        throw new Error(d?.error ?? "verify");
      }
      setMsg("Το passkey προστέθηκε ✅");
      await load();
    } catch (e: any) {
      if (e?.name !== "NotAllowedError" && e?.name !== "AbortError") {
        setMsg("Δεν ήταν δυνατή η προσθήκη passkey.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch("/api/passkey", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  return (
    <div className="card card-pad">
      <div className="flex items-center gap-2">
        <KeyRound size={18} className="text-brand-400" />
        <h2 className="text-sm font-bold text-white">Passkeys</h2>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Συνδέσου χωρίς κωδικό με Face ID / Touch ID / Windows Hello. Πιο ασφαλές και πιο γρήγορο.
      </p>

      {!supported && (
        <p className="mt-3 text-xs text-amber-400">
          Ο browser σου δεν υποστηρίζει passkeys. Σε iPhone χρησιμοποίησε Safari.
        </p>
      )}

      {list && list.length > 0 && (
        <ul className="mt-4 space-y-2">
          {list.map((pk) => (
            <li key={pk.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{pk.deviceName ?? "Passkey"}</div>
                <div className="text-[11px] text-slate-500">
                  Προστέθηκε {new Date(pk.createdAt).toLocaleDateString("el-GR")}
                </div>
              </div>
              <button onClick={() => remove(pk.id)} className="btn-ghost !p-2 text-slate-400 hover:text-rose-400" title="Διαγραφή">
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {list && list.length === 0 && (
        <p className="mt-4 text-xs text-slate-500">Δεν έχεις passkeys ακόμα.</p>
      )}

      {supported && (
        <button onClick={add} disabled={busy} className="btn-primary mt-4 w-full justify-center">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Προσθήκη passkey
        </button>
      )}
      {msg && <p className="mt-2 text-center text-xs text-slate-400">{msg}</p>}
    </div>
  );
}
