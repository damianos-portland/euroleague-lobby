import { SignupForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return <SignupForm googleEnabled={!!process.env.GOOGLE_CLIENT_ID} />;
}
