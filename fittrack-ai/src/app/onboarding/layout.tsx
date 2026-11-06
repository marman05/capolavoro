import { ProfileProvider } from "@/components/app/profile-provider";

export const metadata = { title: "Configura il profilo" };

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <ProfileProvider requireOnboarded={false}>{children}</ProfileProvider>;
}
