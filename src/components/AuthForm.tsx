"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

function GoogleButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => signIn("google", { callbackUrl: "/" })}
      className="btn-ghost w-full justify-center"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
        <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84Z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
      </svg>
      {label}
    </button>
  );
}

function Shell({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 font-black text-white shadow-glow">
            EL
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-white">{title}</h1>
          <p className="mt-1 text-sm text-slate-400">{sub}</p>
        </div>
        <div className="card card-pad">{children}</div>
      </div>
    </div>
  );
}

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) {
      setError("Λάθος email ή κωδικός.");
      setBusy(false);
      return;
    }
    window.location.href = "/"; // full reload so the server layout sees the session
  }

  return (
    <Shell title="Σύνδεση" sub="EuroLeague Lobby">
      <form onSubmit={submit} className="space-y-3">
        <input className="input w-full" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <input className="input w-full" type="password" placeholder="Κωδικός" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <button className="btn-primary w-full justify-center" type="submit" disabled={busy}>
          {busy ? "Σύνδεση…" : "Σύνδεση"}
        </button>
      </form>
      {googleEnabled && (
        <>
          <div className="my-4 flex items-center gap-3 text-[11px] text-slate-500">
            <div className="h-px flex-1 bg-white/10" /> ή <div className="h-px flex-1 bg-white/10" />
          </div>
          <GoogleButton label="Σύνδεση με Google" />
        </>
      )}
      <p className="mt-4 text-center text-xs text-slate-400">
        Δεν έχεις λογαριασμό?{" "}
        <Link href="/signup" className="font-semibold text-brand-400 hover:underline">Εγγραφή</Link>
      </p>
    </Shell>
  );
}

export function SignupForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error ?? "Κάτι πήγε στραβά.");
      setBusy(false);
      return;
    }
    // Auto sign-in after successful signup.
    const login = await signIn("credentials", { email, password, redirect: false });
    if (login?.error) {
      window.location.href = "/login";
      return;
    }
    window.location.href = "/";
  }

  return (
    <Shell title="Εγγραφή" sub="Δημιούργησε λογαριασμό στο EuroLeague Lobby">
      <form onSubmit={submit} className="space-y-3">
        <input className="input w-full" placeholder="Όνομα" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        <input className="input w-full" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <input className="input w-full" type="password" placeholder="Κωδικός (τουλάχιστον 8 χαρακτήρες)" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" minLength={8} />
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <button className="btn-primary w-full justify-center" type="submit" disabled={busy}>
          {busy ? "Δημιουργία…" : "Εγγραφή"}
        </button>
      </form>
      {googleEnabled && (
        <>
          <div className="my-4 flex items-center gap-3 text-[11px] text-slate-500">
            <div className="h-px flex-1 bg-white/10" /> ή <div className="h-px flex-1 bg-white/10" />
          </div>
          <GoogleButton label="Εγγραφή με Google" />
        </>
      )}
      <p className="mt-4 text-center text-xs text-slate-400">
        Έχεις ήδη λογαριασμό?{" "}
        <Link href="/login" className="font-semibold text-brand-400 hover:underline">Σύνδεση</Link>
      </p>
    </Shell>
  );
}
