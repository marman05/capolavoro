"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { addWater } from "@/lib/data";
import { WATER_QUICK_ADD } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function WaterQuickAdd({
  date,
  onAdded,
  className,
  size = "sm",
}: {
  date: string;
  onAdded?: () => void;
  className?: string;
  size?: "sm" | "lg";
}) {
  const [busy, setBusy] = useState<number | null>(null);

  async function add(ml: number) {
    setBusy(ml);
    try {
      await addWater(date, ml);
      toast.success(`+${ml} ml d'acqua`);
      onAdded?.();
    } catch (e) {
      toast.error("Impossibile salvare", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {WATER_QUICK_ADD.map((ml) => (
        <Button
          key={ml}
          variant="secondary"
          size={size === "lg" ? "lg" : "sm"}
          disabled={busy !== null}
          onClick={() => add(ml)}
          className={cn("tabular bg-water/12 text-water hover:bg-water/20", size === "lg" && "h-16 flex-col gap-0.5 text-base")}
        >
          <span className="flex items-center gap-1">
            <Plus className="size-3.5" />
            {ml}
          </span>
          {size === "lg" && <span className="text-xs font-normal opacity-80">ml</span>}
        </Button>
      ))}
    </div>
  );
}
