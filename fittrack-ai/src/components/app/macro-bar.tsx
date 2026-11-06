import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/** Barra di un macronutriente. `colorClass` è una classe bg-* (es. "bg-protein"). */
export function MacroBar({
  label,
  value,
  goal,
  colorClass,
  unit = "g",
}: {
  label: string;
  value: number;
  goal: number;
  colorClass: string;
  unit?: string;
}) {
  const pct = goal ? (value / goal) * 100 : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <span className={cn("size-2 rounded-full", colorClass)} />
          {label}
        </span>
        <span className="tabular text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{Math.round(value)}</span> / {goal}
          {unit}
        </span>
      </div>
      <Progress value={pct} indicatorClassName={pct > 115 ? "bg-destructive" : colorClass} />
    </div>
  );
}
