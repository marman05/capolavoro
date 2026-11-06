"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prettyDate, shiftISODate, toISODate } from "@/lib/date";

export function DateNav({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const today = toISODate();
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl border bg-card p-1.5">
      <Button variant="ghost" size="icon-sm" aria-label="Giorno precedente" onClick={() => onChange(shiftISODate(date, -1))}>
        <ChevronLeft />
      </Button>
      <label className="relative flex-1 cursor-pointer text-center">
        <span className="text-sm font-semibold capitalize">{prettyDate(date)}</span>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Scegli data"
        />
      </label>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Giorno successivo"
        disabled={date >= today}
        onClick={() => onChange(shiftISODate(date, 1))}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
