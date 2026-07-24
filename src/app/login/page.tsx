import { LoginForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm googleEnabled={!!process.env.GOOGLE_CLIENT_ID} />;
}
