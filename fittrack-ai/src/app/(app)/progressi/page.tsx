"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Droplets, Dumbbell, Flame, Loader2, Scale, Trash2, Utensils } from "lucide-react";
import { useProfile } from "@/components/app/profile-provider";
import { PageHeader } from "@/components/app/page-header";
import { StatTile } from "@/components/app/stat-tile";
import { MacroStackChart, SimpleBarChart, TrendLineChart } from "@/components/app/charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deleteWeight, getFoodEntries, getWaterLogs, getWeightLogs, getWorkouts, upsertWeight } from "@/lib/data";
import { dateRange, shiftISODate, shortDate, weekdayShort } from "@/lib/date";
import { useToday } from "@/hooks/use-today";
import { useRealtime } from "@/hooks/use-realtime";
import type { FoodEntry, WaterLog, WeightLog, Workout } from "@/lib/types";

type Range = "7" | "30";

interface RangeData {
  foods: FoodEntry[];
  water: WaterLog[];
  workouts: Workout[];
  weights: WeightLog[];
}

export default function ProgressPage() {
  const { profile, save } = useProfile();
  const today = useToday();
  const [range, setRange] = useState<Range>("7");
  const [data, setData] = useState<RangeData | null>(null);
  const [weightInput, setWeightInput] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);

  const days = Number(range);
  const from = shiftISODate(today, -(days - 1));
  const reload = useCallback(async () => {
    try {
      const [foods, water, workouts, weights] = await Promise.all([
        getFoodEntries(from, today),
        getWaterLogs(from, today),
        getWorkouts(from, today),
        getWeightLogs(shiftISODate(today, -179), today),
      ]);
      setData({ foods, water, workouts, weights });
    } catch (e) {
      toast.error("Errore di caricamento", { description: e instanceof Error ? e.message : undefined });
    }
  }, [from, today]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- caricamento dati asincrono dal server
    reload();
  }, [reload]);
  useRealtime(["food_entries", "water_logs", "workouts", "weight_logs"], reload);

  const dates = dateRange(today, days);
  const label = (d: string) => (days <= 7 ? weekdayShort(d) : shortDate(d));

  async function saveWeight() {
    const kg = Number(weightInput.replace(",", "."));
    if (!(kg >= 30 && kg <= 350)) {
      toast.error("Inserisci un peso valido (30-350 kg)");
      return;
    }
    setSavingWeight(true);
    try {
      await upsertWeight(today, kg);
      await save({ weight_kg: kg });
      setWeightInput("");
      toast.success("Peso registrato");
      reload();
    } catch (e) {
      toast.error("Impossibile salvare", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSavingWeight(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Progressi"
        subtitle="Statistiche basate sui tuoi dati reali."
        action={
          <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
            <TabsList>
              <TabsTrigger value="7">Settimana</TabsTrigger>
              <TabsTrigger value="30">Mese</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {!data ? (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <Content
          data={data}
          dates={dates}
          label={label}
          profile={profile}
          weightInput={weightInput}
          setWeightInput={setWeightInput}
          saveWeight={saveWeight}
          savingWeight={savingWeight}
          onDeleteWeight={async (id) => {
            try {
              await deleteWeight(id);
              reload();
            } catch (e) {
              toast.error("Errore", { description: e instanceof Error ? e.message : undefined });
            }
          }}
        />
      )}
    </div>
  );
}

function Content({
  data,
  dates,
  label,
  profile,
  weightInput,
  setWeightInput,
  saveWeight,
  savingWeight,
  onDeleteWeight,
}: {
  data: RangeData;
  dates: string[];
  label: (d: string) => string;
  profile: ReturnType<typeof useProfile>["profile"];
  weightInput: string;
  setWeightInput: (s: string) => void;
  saveWeight: () => void;
  savingWeight: boolean;
  onDeleteWeight: (id: string) => void;
}) {
  const daily = dates.map((d) => {
    const f = data.foods.filter((x) => x.entry_date === d);
    const w = data.workouts.filter((x) => x.workout_date === d);
    return {
      date: d,
      label: label(d),
      kcal: Math.round(f.reduce((a, x) => a + x.calories, 0)),
      protein: Math.round(f.reduce((a, x) => a + x.protein_g, 0)),
      carbs: Math.round(f.reduce((a, x) => a + x.carbs_g, 0)),
      fat: Math.round(f.reduce((a, x) => a + x.fat_g, 0)),
      burned: w.reduce((a, x) => a + x.calories_burned, 0),
      minutes: w.reduce((a, x) => a + x.duration_min, 0),
      sessions: w.length,
      water: data.water.filter((x) => x.log_date === d).reduce((a, x) => a + x.amount_ml, 0),
      logged: f.length > 0,
    };
  });

  const logged = daily.filter((d) => d.logged);
  const avg = (k: "kcal" | "protein" | "water") => {
    const src = k === "water" ? daily.filter((d) => d.water > 0) : logged;
    return src.length ? Math.round(src.reduce((a, d) => a + d[k], 0) / src.length) : 0;
  };
  const totalSessions = daily.reduce((a, d) => a + d.sessions, 0);
  const totalBurned = daily.reduce((a, d) => a + d.burned, 0);

  const weights = data.weights;
  const weightSeries = weights.map((w) => ({ label: shortDate(w.log_date), kg: w.weight_kg }));
  const first = weights[0]?.weight_kg;
  const last = weights[weights.length - 1]?.weight_kg;
  const delta = first !== undefined && last !== undefined ? Math.round((last - first) * 10) / 10 : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={<Utensils className="size-4" />} label="Media calorie" value={avg("kcal")} unit="kcal" hint={`${logged.length} giorni registrati`} />
        <StatTile icon={<Flame className="size-4" />} accent="var(--burn)" label="Bruciate" value={totalBurned} unit="kcal" hint="totale periodo" />
        <StatTile icon={<Droplets className="size-4" />} accent="var(--water)" label="Media acqua" value={avg("water")} unit="ml" />
        <StatTile icon={<Dumbbell className="size-4" />} accent="var(--carbs)" label="Allenamenti" value={totalSessions} hint={`${daily.reduce((a, d) => a + d.minutes, 0)} min totali`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Calorie assunte</CardTitle>
            <CardDescription>kcal al giorno · obiettivo {profile.calorie_goal}</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarChart data={daily} dataKey="kcal" name="Assunte" unit="kcal" color="var(--primary)" goal={profile.calorie_goal ?? undefined} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Calorie bruciate</CardTitle>
            <CardDescription>kcal da allenamenti</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarChart data={daily} dataKey="burned" name="Bruciate" unit="kcal" color="var(--burn)" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Macronutrienti</CardTitle>
            <CardDescription>grammi al giorno · media proteine {avg("protein")} g</CardDescription>
          </CardHeader>
          <CardContent>
            <MacroStackChart data={daily} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Acqua bevuta</CardTitle>
            <CardDescription>ml al giorno · obiettivo {profile.water_goal_ml}</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarChart data={daily} dataKey="water" name="Acqua" unit="ml" color="var(--water)" goal={profile.water_goal_ml} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Allenamenti completati</CardTitle>
            <CardDescription>minuti di attività al giorno · {totalSessions} sessioni</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarChart data={daily} dataKey="minutes" name="Attività" unit="min" color="var(--primary)" height={180} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Scale className="size-4" /> Andamento del peso
            </CardTitle>
            <CardDescription>
              Ultimi 6 mesi
              {delta !== null && weights.length > 1 && (
                <>
                  {" · "}
                  <span className={delta < 0 ? "text-primary" : delta > 0 ? "text-burn" : ""}>
                    {delta > 0 ? "+" : ""}
                    {delta.toLocaleString("it-IT")} kg
                  </span>
                </>
              )}
              {profile.target_weight_kg ? ` · obiettivo ${profile.target_weight_kg} kg` : ""}
            </CardDescription>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Input
              inputMode="decimal"
              placeholder="Peso di oggi (kg)"
              className="sm:w-44"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveWeight()}
            />
            <Button onClick={saveWeight} disabled={!weightInput || savingWeight}>
              {savingWeight && <Loader2 className="animate-spin" />} Salva
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {weights.length ? (
            <>
              <TrendLineChart data={weightSeries} dataKey="kg" name="Peso" unit="kg" color="var(--primary)" goal={profile.target_weight_kg} />
              <ul className="mt-4 flex flex-wrap gap-2">
                {[...weights].reverse().slice(0, 8).map((w) => (
                  <li key={w.id} className="tabular flex items-center gap-1 rounded-full bg-muted py-1 pr-1 pl-3 text-xs">
                    {shortDate(w.log_date)} · <b>{w.weight_kg} kg</b>
                    <button aria-label="Elimina misurazione" className="rounded-full p-1 hover:bg-background" onClick={() => onDeleteWeight(w.id)}>
                      <Trash2 className="size-3 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Registra il tuo peso per vedere l&apos;andamento nel tempo.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
