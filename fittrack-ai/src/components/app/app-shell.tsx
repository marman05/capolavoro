"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, BookOpen, Camera, Droplets, Home, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { Reminders } from "./reminders";
import { useProfile } from "./profile-provider";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/diario", label: "Diario", icon: BookOpen },
  { href: "/attivita", label: "Attività", icon: Activity },
  { href: "/progressi", label: "Progressi", icon: BarChart3 },
  { href: "/profilo", label: "Profilo", icon: User },
];

const EXTRA = [
  { href: "/scansiona", label: "Scansiona piatto", icon: Camera },
  { href: "/acqua", label: "Acqua", icon: Droplets },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile } = useProfile();

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-card/60 px-4 py-6 backdrop-blur lg:flex">
        <Link href="/" className="px-2">
          <Logo />
        </Link>
        <nav className="mt-8 flex flex-col gap-1">
          {[...NAV.slice(0, 2), ...EXTRA, ...NAV.slice(2)].map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground",
                  active && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                )}
              >
                <item.icon className="size-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center justify-between rounded-xl border bg-background/60 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{profile.display_name || "Il tuo profilo"}</p>
            <p className="text-xs text-muted-foreground">{profile.calorie_goal ?? "—"} kcal / giorno</p>
          </div>
          <ThemeToggle />
        </div>
      </aside>

      {/* Header mobile */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-lg lg:hidden">
        <Link href="/">
          <Logo className="[&>span:first-child]:size-8" />
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/acqua"
            aria-label="Acqua"
            className="grid size-9 place-items-center rounded-full text-water transition hover:bg-muted"
          >
            <Droplets className="size-[18px]" />
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pt-4 pb-32 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">{children}</main>

      {/* Pulsante fotocamera mobile */}
      {pathname !== "/scansiona" && (
        <Link
          href="/scansiona"
          aria-label="Scansiona un piatto con l'AI"
          className="fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition active:scale-95 lg:hidden"
        >
          <Camera className="size-6" />
        </Link>
      )}

      {/* Navigazione inferiore mobile */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/85 backdrop-blur-xl lg:hidden">
        <ul className="mx-auto grid h-16 max-w-md grid-cols-5">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition",
                    active && "text-primary",
                  )}
                >
                  <span className={cn("grid h-7 w-12 place-items-center rounded-full transition", active && "bg-primary/12")}>
                    <item.icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Reminders />
    </div>
  );
}
