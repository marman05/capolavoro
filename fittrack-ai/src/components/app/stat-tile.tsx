import { cn } from "@/lib/utils";

export function StatTile({
  icon,
  label,
  value,
  unit,
  hint,
  className,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  unit?: string;
  hint?: React.ReactNode;
  className?: string;
  accent?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-2xl border bg-card p-4", className)}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="grid size-7 place-items-center rounded-lg" style={{ background: `color-mix(in oklch, ${accent ?? "var(--primary)"} 14%, transparent)`, color: accent ?? "var(--primary)" }}>
          {icon}
        </span>
        {label}
      </div>
      <div className="tabular text-2xl font-semibold tracking-tight">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
      </div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
