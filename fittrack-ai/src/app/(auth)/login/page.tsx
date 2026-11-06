import { AuthForm } from "@/components/app/auth-form";

export const metadata = { title: "Accedi" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
