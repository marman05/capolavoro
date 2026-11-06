"use client";

import { MEALS } from "@/lib/constants";
import type { MealType } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MealSelect({ value, onChange }: { value: MealType; onChange: (m: MealType) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Pasto">
      {MEALS.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={value === m.id}
          onClick={() => onChange(m.id)}
          className={cn(
            "flex flex-col items-center gap-0.5 rounded-xl border px-1 py-2 text-xs font-medium transition",
            value === m.id ? "border-primary bg-primary/10 text-primary" : "bg-card text-muted-foreground hover:bg-muted",
          )}
        >
          <span className="text-base">{m.emoji}</span>
          {m.label}
        </button>
      ))}
    </div>
  );
}
