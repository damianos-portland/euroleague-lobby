import { PasskeyManager } from "@/components/PasskeyManager";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-xl font-extrabold text-white">Ρυθμίσεις</h1>
      <p className="mb-5 text-sm text-slate-400">Ασφάλεια λογαριασμού και σύνδεση.</p>
      <PasskeyManager />
    </div>
  );
}
