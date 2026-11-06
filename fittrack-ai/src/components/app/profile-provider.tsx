"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getProfile, updateProfile } from "@/lib/data";
import type { Profile } from "@/lib/types";
import { Logo } from "./logo";

interface Ctx {
  profile: Profile;
  refresh: () => Promise<void>;
  save: (patch: Partial<Profile>) => Promise<Profile>;
}

const ProfileContext = createContext<Ctx | null>(null);

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile deve essere usato dentro <ProfileProvider>");
  return ctx;
}

export function ProfileProvider({ children, requireOnboarded = true }: { children: React.ReactNode; requireOnboarded?: boolean }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    try {
      const p = await getProfile();
      if (!p) {
        router.replace("/login");
        return;
      }
      setProfile(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore di caricamento");
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- caricamento dati asincrono da Supabase
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (profile && requireOnboarded && !profile.onboarded && pathname !== "/onboarding") router.replace("/onboarding");
  }, [profile, requireOnboarded, pathname, router]);

  const save = useCallback(
    async (patch: Partial<Profile>) => {
      if (!profile) throw new Error("Profilo non caricato");
      const p = await updateProfile(profile.id, patch);
      const next = { ...profile, ...p };
      setProfile(next);
      return next;
    },
    [profile],
  );

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <Logo />
        <p className="max-w-sm text-sm text-muted-foreground">
          Impossibile caricare il profilo: {error}. Verifica di aver applicato la migrazione del database Supabase.
        </p>
        <button className="text-sm font-medium text-primary" onClick={() => location.reload()}>
          Riprova
        </button>
      </div>
    );
  }
  if (!profile || (requireOnboarded && !profile.onboarded)) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="animate-pulse">
          <Logo />
        </div>
      </div>
    );
  }
  return <ProfileContext.Provider value={{ profile, refresh, save }}>{children}</ProfileContext.Provider>;
}
