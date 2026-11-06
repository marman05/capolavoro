"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Camera, Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useProfile } from "@/components/app/profile-provider";
import { PageHeader } from "@/components/app/page-header";
import { DateNav } from "@/components/app/date-nav";
import { FoodPicker, NutrientSummary, type PickedFood } from "@/components/app/food-picker";
import { MealSelect } from "@/components/app/meal-select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDayData } from "@/hooks/use-day-data";
import { addFoodEntries, deleteFoodEntry, updateFoodEntry } from "@/lib/data";
import { MEALS, MEAL_LABEL, mealForNow } from "@/lib/constants";
import { foodTotals, mealTotals } from "@/lib/totals";
import { round1 } from "@/lib/nutrition";
import { toISODate } from "@/lib/date";
import type { FoodEntry, MealType } from "@/lib/types";

export default function DiaryPage() {
  const { profile } = useProfile();
  const [date, setDate] = useState(() => toISODate());
  const { data, reload } = useDayData(date);
  // Apertura diretta della ricerca da altre pagine (/diario?cerca=1). La pagina viene
  // renderizzata solo nel browser (dopo il caricamento del profilo), quindi window è disponibile.
  const [addMeal, setAddMeal] = useState<MealType | null>(() =>
    new URLSearchParams(window.location.search).get("cerca") ? mealForNow() : null,
  );
  const [editing, setEditing] = useState<FoodEntry | null>(null);

  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, "", "/diario");
  }, []);

  const totals = data ? foodTotals(data.foods) : null;
  const goal = profile.calorie_goal ?? 2000;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Diario"
        subtitle="Tutto ciò che mangi, pasto per pasto."
        action={
          <Button asChild className="hidden sm:inline-flex">
            <Link href={`/scansiona?data=${date}`}>
              <Camera /> Foto AI
            </Link>
          </Button>
        }
      />
      <DateNav date={date} onChange={setDate} />

      {totals ? (
        <Card className="grid grid-cols-4 gap-2 p-4 text-center">
          <Summary label="Calorie" value={totals.calories} goal={goal} unit="kcal" />
          <Summary label="Proteine" value={totals.protein} goal={profile.protein_goal_g ?? 0} unit="g" cls="text-protein" />
          <Summary label="Carbo" value={totals.carbs} goal={profile.carbs_goal_g ?? 0} unit="g" cls="text-carbs" />
          <Summary label="Grassi" value={totals.fat} goal={profile.fat_goal_g ?? 0} unit="g" cls="text-fat" />
        </Card>
      ) : (
        <Skeleton className="h-20" />
      )}

      {!data ? (
        <div className="flex flex-col gap-3">
          {MEALS.map((m) => (
            <Skeleton key={m.id} className="h-36" />
          ))}
        </div>
      ) : (
        MEALS.map((m) => {
          const items = data.foods.filter((f) => f.meal_type === m.id);
          const t = mealTotals(data.foods, m.id);
          return (
            <Card key={m.id} id={m.id} className="scroll-mt-20 overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{m.emoji}</span>
                  <div>
                    <h2 className="font-semibold">{m.label}</h2>
                    <p className="tabular text-xs text-muted-foreground">
                      {Math.round(t.calories)} kcal · P {Math.round(t.protein)} · C {Math.round(t.carbs)} · G {Math.round(t.fat)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button asChild variant="ghost" size="icon-sm" aria-label={`Foto AI per ${m.label}`}>
                    <Link href={`/scansiona?pasto=${m.id}&data=${date}`}>
                      <Camera />
                    </Link>
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setAddMeal(m.id)}>
                    <Plus /> Aggiungi
                  </Button>
                </div>
              </div>
              {items.length ? (
                <ul className="divide-y">
                  {items.map((f) => (
                    <li key={f.id} className="group flex items-center gap-3 px-4 py-3">
                      <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(f)}>
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          {f.source === "ai" && <Sparkles className="size-3.5 shrink-0 text-primary" aria-label="Riconosciuto con AI" />}
                          {f.name}
                        </p>
                        <p className="tabular text-xs text-muted-foreground">
                          {round1(f.grams)} g · P {round1(f.protein_g)} · C {round1(f.carbs_g)} · G {round1(f.fat_g)}
                        </p>
                      </button>
                      <span className="tabular text-sm font-semibold">{Math.round(f.calories)}</span>
                      <Button variant="ghost" size="icon-sm" aria-label="Modifica" onClick={() => setEditing(f)}>
                        <Pencil className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <button
                  onClick={() => setAddMeal(m.id)}
                  className="w-full px-4 py-5 text-center text-sm text-muted-foreground transition hover:bg-muted/50"
                >
                  Nessun alimento — tocca per aggiungere
                </button>
              )}
            </Card>
          );
        })
      )}

      <AddFoodDialog
        key={addMeal ?? "closed"}
        meal={addMeal}
        date={date}
        onClose={() => setAddMeal(null)}
        onAdded={() => {
          setAddMeal(null);
          reload();
        }}
      />
      <EditFoodDialog key={editing?.id ?? "none"} entry={editing} onClose={() => setEditing(null)} onChanged={reload} />
    </div>
  );
}

function Summary({ label, value, goal, unit, cls }: { label: string; value: number; goal: number; unit: string; cls?: string }) {
  return (
    <div>
      <p className={`tabular text-lg font-semibold ${cls ?? ""}`}>{Math.round(value)}</p>
      <p className="tabular text-[11px] text-muted-foreground">
        / {goal} {unit}
      </p>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

function AddFoodDialog({
  meal,
  date,
  onClose,
  onAdded,
}: {
  meal: MealType | null;
  date: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [target, setTarget] = useState<MealType>(meal ?? "breakfast");

  async function add(food: PickedFood) {
    try {
      await addFoodEntries([
        {
          entry_date: date,
          meal_type: target,
          name: food.name,
          grams: food.grams,
          calories: food.calories,
          protein_g: food.protein_g,
          carbs_g: food.carbs_g,
          fat_g: food.fat_g,
          source: food.source,
        },
      ]);
      toast.success(`${food.name} aggiunto a ${MEAL_LABEL[target].toLowerCase()}`);
      onAdded();
    } catch (e) {
      toast.error("Impossibile salvare", { description: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <Dialog open={meal !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aggiungi alimento</DialogTitle>
          <DialogDescription>Cerca nel database nutrizionale o inserisci i valori a mano.</DialogDescription>
        </DialogHeader>
        {meal && <FoodPicker key={meal} onPick={add} extra={<MealSelect value={target} onChange={setTarget} />} />}
      </DialogContent>
    </Dialog>
  );
}

function EditFoodDialog({ entry, onClose, onChanged }: { entry: FoodEntry | null; onClose: () => void; onChanged: () => void }) {
  const [grams, setGrams] = useState(entry ? String(round1(entry.grams)) : "");
  const [meal, setMeal] = useState<MealType>(entry?.meal_type ?? "breakfast");
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);

  if (!entry) return <Dialog open={false} />;
  const g = Number(grams.replace(",", "."));
  const valid = Number.isFinite(g) && g > 0 && g <= 5000;
  const k = valid ? g / entry.grams : 0;
  const scaled = {
    calories: round1(entry.calories * k),
    protein_g: round1(entry.protein_g * k),
    carbs_g: round1(entry.carbs_g * k),
    fat_g: round1(entry.fat_g * k),
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="pr-4 leading-snug">{entry.name}</DialogTitle>
          <DialogDescription>Modifica la quantità o sposta l&apos;alimento in un altro pasto.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-g">Quantità (g)</Label>
          <Input id="edit-g" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} aria-invalid={!valid} />
        </div>
        <NutrientSummary calories={scaled.calories} protein={scaled.protein_g} carbs={scaled.carbs_g} fat={scaled.fat_g} />
        <MealSelect value={meal} onChange={setMeal} />
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="text-destructive"
            disabled={busy !== null}
            onClick={async () => {
              setBusy("delete");
              try {
                await deleteFoodEntry(entry.id);
                toast.success("Alimento eliminato");
                onChanged();
                onClose();
              } catch (e) {
                toast.error("Errore", { description: e instanceof Error ? e.message : undefined });
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === "delete" ? <Loader2 className="animate-spin" /> : <Trash2 />} Elimina
          </Button>
          <Button
            disabled={!valid || busy !== null}
            onClick={async () => {
              setBusy("save");
              try {
                await updateFoodEntry(entry.id, { grams: g, meal_type: meal, ...scaled });
                toast.success("Modifiche salvate");
                onChanged();
                onClose();
              } catch (e) {
                toast.error("Errore", { description: e instanceof Error ? e.message : undefined });
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === "save" && <Loader2 className="animate-spin" />} Salva
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
