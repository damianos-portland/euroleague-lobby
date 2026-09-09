import { ResetForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

// The reset token arrives as ?token=... in the emailed link. Reading it from
// searchParams (server) avoids a client Suspense boundary for useSearchParams.
export default function ResetPage({ searchParams }: { searchParams: { token?: string } }) {
  return <ResetForm token={searchParams.token ?? ""} />;
}
