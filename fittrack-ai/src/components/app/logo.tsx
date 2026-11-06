import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm", className)}>
      <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden>
        <path d="M4 13.5h3l2-5 3.5 9 2.5-6 1.5 2H20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight">
        FitTrack <span className="text-primary">AI</span>
      </span>
    </span>
  );
}
