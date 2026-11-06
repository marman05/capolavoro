"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Flame, Loader2, Timer, Trash2, Trophy } from "lucide-react";
import { useProfile } from "@/components/app/profile-provider";
import { PageHeader } from "@/components/app/page-header";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ACTIVITIES, INTENSITIES, caloriesBurned, computeMET, getActivity, type ActivityDef } from "@/lib/met";
import { addWorkout, deleteWorkout, getWorkouts } from "@/lib/data";
import { prettyDate, shiftISODate, toISODate } from "@/lib/date";
import { useToday } from "@/hooks/use-today";
import { useRealtime } from "@/hooks/use-realtime";
import { cn } from "@/lib/utils";
import type { Intensity, Workout } from "@/lib/types";

export default function ActivityPage() {
  const today = useToday();
  const [workouts, setWorkouts] = useState<Workout[] | null>(null);
  const [selected, setSelected] = useState<ActivityDef | null>(null);

  const from = shiftISODate(today, -59);
  const reload = useCallback(async () => {
    try {
      setWorkouts(await getWorkouts(from, today));
    } catch (e) {
      toast.error("Errore di caricamento", { description: e instanceof Error ? e.message : undefined });
    }
  }, [from, today]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- caricamento dati asincrono da Supabase
    reload();
  }, [reload]);
  useRealtime(["workouts"], reload);

  const weekStart = shiftISODate(today, -6);
  const week = (workouts ?? []).filter((w) => w.workout_date >= weekStart);
  const todayW = (workouts ?? []).filter((w) => w.workout_date === today);
  const grouped = new Map<string, Workout[]>();
  (workouts ?? []).forEach((w) => grouped.set(w.workout_date, [...(grouped.get(w.workout_date) ?? []), w]));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Attività" subtitle="Registra gli allenamenti: le calorie bruciate si sommano al tuo budget." />

      <div className="grid grid-cols-3 gap-3">
        <StatTile
          icon={<Flame className="size-4" />}
          accent="var(--burn)"
          label="Oggi"
          value={todayW.reduce((a, w) => a + w.calories_burned, 0)}
          unit="kcal"
        />
        <StatTile
          icon={<Timer className="size-4" />}
          label="7 giorni"
          value={week.reduce((a, w) => a + w.duration_min, 0)}
          unit="min"
        />
        <StatTile icon={<Trophy className="size-4" />} accent="var(--carbs)" label="Sessioni" value={week.length} hint="ultimi 7 giorni" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nuovo allenamento</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {ACTIVITIES.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelected(a)}
              className="flex flex-col items-center gap-1.5 rounded-2xl border bg-card p-3 text-center text-xs font-medium transition hover:border-primary/40 hover:bg-primary/5 active:scale-95"
            >
              <span className="text-2xl">{a.emoji}</span>
              {a.label}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Storico allenamenti</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!workouts ? (
            <Skeleton className="h-40" />
          ) : grouped.size === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nessun allenamento registrato negli ultimi 60 giorni.</p>
          ) : (
            [...grouped.entries()].map(([date, list]) => (
              <div key={date}>
                <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{prettyDate(date)}</p>
                <ul className="flex flex-col gap-2">
                  {list.map((w) => {
                    const a = getActivity(w.activity);
                    return (
                      <li key={w.id} className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
                        <span className="grid size-10 place-items-center rounded-xl bg-card text-xl">{a?.emoji ?? "🏅"}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{a?.label ?? w.activity}</p>
                          <p className="tabular text-xs text-muted-foreground">
                            {w.duration_min} min · {INTENSITIES.find((i) => i.id === w.intensity)?.label}
                            {w.distance_km ? ` · ${w.distance_km} km` : ""} · MET {w.met}
                          </p>
                          {w.notes && <p className="truncate text-xs text-muted-foreground italic">{w.notes}</p>}
                        </div>
                        <span className="tabular text-sm font-semibold text-burn">{w.calories_burned} kcal</span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Elimina"
                          onClick={async () => {
                            try {
                              await deleteWorkout(w.id);
                              toast.success("Allenamento eliminato");
                              reload();
                            } catch (e) {
                              toast.error("Errore", { description: e instanceof Error ? e.message : undefined });
                            }
                          }}
                        >
                          <Trash2 className="size-4 text-muted-foreground" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <WorkoutDialog
        key={selected?.id ?? "none"}
        activity={selected}
        onClose={() => setSelected(null)}
        onSaved={() => {
          setSelected(null);
          reload();
        }}
      />
    </div>
  );
}

function WorkoutDialog({ activity, onClose, onSaved }: { activity: ActivityDef | null; onClose: () => void; onSaved: () => void }) {
  const { profile } = useProfile();
  const [date, setDate] = useState(() => toISODate());
  const [duration, setDuration] = useState("30");
  const [intensity, setIntensity] = useState<Intensity>("moderate");
  const [distance, setDistance] = useState("");
  const [weight, setWeight] = useState(String(profile.weight_kg ?? 70));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  if (!activity) return <Dialog open={false} />;

  const d = Number(duration);
  const kg = Number(weight.replace(",", "."));
  const km = distance ? Number(distance.replace(",", ".")) : null;
  const valid = d > 0 && d <= 1440 && kg >= 30 && kg <= 350 && (km === null || (km > 0 && km <= 500));
  const met = valid ? computeMET(activity.id, intensity, d, km) : 0;
  const kcal = valid ? caloriesBurned(met, kg, d) : 0;
  const speed = km && d ? km / (d / 60) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">{activity.emoji}</span> {activity.label}
          </DialogTitle>
          <DialogDescription>Stima con formula MET × peso (kg) × durata (ore).</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="w-dur">Durata (min)</Label>
            <Input id="w-dur" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="w-date">Data</Label>
            <Input id="w-date" type="date" value={date} max={toISODate()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Intensità</Label>
          <div className="grid grid-cols-3 gap-2">
            {INTENSITIES.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => setIntensity(i.id)}
                className={cn(
                  "rounded-xl border py-2.5 text-sm font-medium transition",
                  intensity === i.id ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {i.label}
                <span className="block text-[10px] font-normal opacity-70">MET {activity.met[i.id]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {activity.supportsDistance && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="w-km">Distanza (km)</Label>
              <Input id="w-km" inputMode="decimal" placeholder="facoltativa" value={distance} onChange={(e) => setDistance(e.target.value)} />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="w-kg">Peso corporeo (kg)</Label>
            <Input id="w-kg" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
        </div>
        {activity.speedTable && speed && (
          <p className="-mt-2 text-xs text-muted-foreground">
            Velocità media {speed.toFixed(1)} km/h: il MET viene calcolato dalla velocità.
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="w-notes">Note</Label>
          <Input id="w-notes" maxLength={200} placeholder="Es. ripetute in salita" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-burn/10 p-4">
          <div>
            <p className="text-xs text-muted-foreground">Calorie bruciate stimate</p>
            <p className="tabular text-3xl font-semibold text-burn">{kcal} kcal</p>
          </div>
          <span className="tabular text-xs text-muted-foreground">MET {met}</span>
        </div>

        <Button
          size="lg"
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await addWorkout({
                workout_date: date,
                activity: activity.id,
                duration_min: d,
                intensity,
                distance_km: km,
                body_weight_kg: kg,
                met,
                calories_burned: kcal,
                notes: notes.trim() || null,
              });
              toast.success(`${activity.label} salvato`, { description: `${kcal} kcal bruciate 🔥` });
              onSaved();
            } catch (e) {
              toast.error("Impossibile salvare", { description: e instanceof Error ? e.message : undefined });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <Loader2 className="animate-spin" />} Salva allenamento
        </Button>
      </DialogContent>
    </Dialog>
  );
}
