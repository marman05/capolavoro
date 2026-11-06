"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function OptionCard({
  selected,
  onClick,
  title,
  description,
  icon,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left transition active:scale-[0.99]",
        selected ? "border-primary bg-primary/8 ring-1 ring-primary/40" : "hover:bg-muted/60",
      )}
    >
      {icon && <span className="text-2xl">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        {description && <span className="block text-sm text-muted-foreground">{description}</span>}
      </span>
      <span
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full border transition",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-input",
        )}
      >
        {selected && <Check className="size-3.5" />}
      </span>
    </button>
  );
}
