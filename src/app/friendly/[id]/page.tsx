import { FriendlyMatchRoom } from "@/components/FriendlyMatchRoom";

export const dynamic = "force-dynamic";

export default function FriendlyMatchPage({ params }: { params: { id: string } }) {
  return <FriendlyMatchRoom matchId={params.id} />;
}
