"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  goal: number;
  eaten: number;
  burned: number;
  size?: number;
}

/** Anello principale: progresso delle calorie mangiate rispetto al budget (obiettivo + bruciate). */
export function CalorieRing({ goal, eaten, burned, size = 240 }: Props) {
  const budget = Math.max(1, goal + burned);
  const remaining = Math.round(goal - eaten + burned);
  const over = remaining < 0;
  const pct = Math.min(1, eaten / budget);
  const stroke = size * 0.085;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={`${Math.round(eaten)} kcal su ${budget}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={over ? "var(--destructive)" : "var(--primary)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{over ? "Oltre" : "Rimanenti"}</span>
        <span className={cn("tabular text-5xl font-semibold tracking-tight", over && "text-destructive")}>
          {Math.abs(remaining).toLocaleString("it-IT")}
        </span>
        <span className="text-sm text-muted-foreground">kcal</span>
      </div>
    </div>
  );
}
