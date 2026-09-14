import { PageHeader } from "@/components/PageHeader";
import { FriendlyLobby } from "@/components/FriendlyLobby";

export const dynamic = "force-dynamic";

export default function FriendlyPage() {
  return (
    <>
      <PageHeader
        title="Φιλικά"
        subtitle="Πρόκάλεσε άλλον χρήστη σε φιλικό αγώνα. Φτιάχνετε ο καθένας πεντάδα (2G / 2F / 1C) και πέντε παίκτες πάγκο, και το ματς παίζεται ζωντανά. Νικητής είτε στο σκορ του αγώνα είτε στους συνολικούς fantasy πόντους — το επιλέγει αυτός που προκαλεί."
        status="● FRIENDLY ARENA · 2026-27"
      />
      <FriendlyLobby />
    </>
  );
}
