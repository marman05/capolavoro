import { ProfileProvider } from "@/components/app/profile-provider";
import { AppShell } from "@/components/app/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProfileProvider>
      <AppShell>{children}</AppShell>
    </ProfileProvider>
  );
}
