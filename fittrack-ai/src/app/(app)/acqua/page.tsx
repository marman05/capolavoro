"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Droplets, Loader2, Settings2, Trash2 } from "lucide-react";
import { useProfile } from "@/components/app/profile-provider";
import { PageHeader } from "@/components/app/page-header";
import { WaterQuickAdd } from "@/components/app/water-quick-add";
import { CumulativeAreaChart, SimpleBarChart } from "@/components/app/charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addWater, deleteWater, getWaterLogs } from "@/lib/data";
import { dateRange, shiftISODate, timeOf, weekdayShort, shortDate } from "@/lib/date";
import { useToday } from "@/hooks/use-today";
import { useRealtime } from "@/hooks/use-realtime";
import type { WaterLog } from "@/lib/types";

export default function WaterPage() {
  const { profile, save } = useProfile();
  const today = useToday();
  const [logs, setLogs] = useState<WaterLog[] | null>(null);
  const [custom, setCustom] = useState("");
  const [goalOpen, setGoalOpen] = useState(false);

  const from = shiftISODate(today, -29);
  const reload = useCallback(async () => {
    try {
      setLogs(await getWaterLogs(from, today));
    } catch (e) {
      toast.error("Errore di caricamento", { description: e instanceof Error ? e.message : undefined });
    }
  }, [from, today]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- caricamento dati asincrono dal server
    reload();
  }, [reload]);
  useRealtime(["water_logs"], reload);

  if (!logs) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-72" />
        <Skeleton className="h-60" />
      </div>
    );
  }

  const goal = profile.water_goal_ml;
  const todayLogs = logs.filter((l) => l.log_date === today);
  const total = todayLogs.reduce((a, l) => a + l.amount_ml, 0);
  const pct = Math.round((total / goal) * 100);

  // Grafico cumulativo di oggi (passi orari dalle 6 all'ora corrente).
  const nowH = new Date().getHours();
  const hourly = Array.from({ length: Math.max(1, nowH - 5) }, (_, i) => {
    const h = 6 + i;
    const sum = todayLogs.filter((l) => new Date(l.logged_at).getHours() <= h).reduce((a, l) => a + l.amount_ml, 0);
    return { label: `${String(h).padStart(2, "0")}:00`, ml: sum };
  });

  const byDay = new Map<string, number>();
  logs.forEach((l) => byDay.set(l.log_date, (byDay.get(l.log_date) ?? 0) + l.amount_ml));
  const week = dateRange(today, 7).map((d) => ({ label: weekdayShort(d), ml: byDay.get(d) ?? 0 }));
  const history = dateRange(today, 30)
    .filter((d) => byDay.has(d))
    .reverse()
    .slice(0, 14);
  const daysOnGoal = dateRange(today, 7).filter((d) => (byDay.get(d) ?? 0) >= goal).length;

  async function addCustom() {
    const ml = Math.round(Number(custom));
    if (!(ml > 0 && ml <= 3000)) {
      toast.error("Inserisci una quantità tra 1 e 3000 ml");
      return;
    }
    try {
      await addWater(today, ml);
      setCustom("");
      toast.success(`+${ml} ml d'acqua`);
      reload();
    } catch (e) {
      toast.error("Impossibile salvare", { description: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Idratazione"
        subtitle={`Obiettivo giornaliero: ${goal.toLocaleString("it-IT")} ml`}
        action={
          <Button variant="outline" size="sm" onClick={() => setGoalOpen(true)}>
            <Settings2 /> Obiettivo
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col items-center gap-5 p-6">
          <WaterGlass pct={pct} />
          <div className="text-center">
            <p className="tabular text-4xl font-semibold tracking-tight">
              {total.toLocaleString("it-IT")} <span className="text-lg font-normal text-muted-foreground">ml</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {pct >= 100 ? "Obiettivo raggiunto! 🎉" : `${pct}% · mancano ${(goal - total).toLocaleString("it-IT")} ml`}
            </p>
          </div>
          <WaterQuickAdd date={today} onAdded={reload} size="lg" className="w-full" />
          <div className="flex w-full gap-2">
            <Input
              inputMode="numeric"
              placeholder="Altra quantità (ml)"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && addCustom()}
            />
            <Button onClick={addCustom} disabled={!custom}>
              Aggiungi
            </Button>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Consumo di oggi</CardTitle>
            </CardHeader>
            <CardContent>
              <CumulativeAreaChart data={hourly} dataKey="ml" name="Totale" unit="ml" color="var(--water)" goal={goal} height={180} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Ultimi 7 giorni</CardTitle>
              <span className="text-xs text-muted-foreground">{daysOnGoal}/7 giorni a obiettivo</span>
            </CardHeader>
            <CardContent>
              <SimpleBarChart data={week} dataKey="ml" name="Acqua" unit="ml" color="var(--water)" goal={goal} height={180} />
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Registrazioni di oggi</CardTitle>
          </CardHeader>
          <CardContent>
            {todayLogs.length ? (
              <ul className="divide-y">
                {[...todayLogs].reverse().map((l) => (
                  <li key={l.id} className="flex items-center gap-3 py-2.5">
                    <span className="grid size-8 place-items-center rounded-lg bg-water/12 text-water">
                      <Droplets className="size-4" />
                    </span>
                    <span className="tabular flex-1 text-sm font-medium">{l.amount_ml} ml</span>
                    <span className="tabular text-xs text-muted-foreground">{timeOf(l.logged_at)}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Elimina"
                      onClick={async () => {
                        try {
                          await deleteWater(l.id);
                          reload();
                        } catch (e) {
                          toast.error("Errore", { description: e instanceof Error ? e.message : undefined });
                        }
                      }}
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Nessuna registrazione oggi. Inizia con un bicchiere!</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Storico</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length ? (
              <ul className="flex flex-col gap-2.5">
                {history.map((d) => {
                  const v = byDay.get(d) ?? 0;
                  const p = Math.min(100, (v / goal) * 100);
                  return (
                    <li key={d} className="flex items-center gap-3 text-sm">
                      <span className="w-14 shrink-0 text-xs text-muted-foreground capitalize">{shortDate(d)}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-water" style={{ width: `${p}%` }} />
                      </div>
                      <span className="tabular w-16 text-right text-xs font-medium">{(v / 1000).toLocaleString("it-IT", { maximumFractionDigits: 2 })} L</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Lo storico comparirà qui.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <GoalDialog key={String(goalOpen)} open={goalOpen} onOpenChange={setGoalOpen} goal={goal} onSave={(v) => save({ water_goal_ml: v })} />
    </div>
  );
}

function WaterGlass({ pct }: { pct: number }) {
  const fill = Math.min(100, Math.max(0, pct));
  return (
    <div className="relative h-44 w-32 overflow-hidden rounded-b-[2.5rem] rounded-t-xl border-4 border-water/30 bg-water/5">
      <div
        className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-water to-water/70 transition-[height] duration-1000 ease-out"
        style={{ height: `${fill}%` }}
      >
        <div className="absolute -top-2 left-0 h-4 w-[200%] animate-[wave_3s_linear_infinite] rounded-[50%] bg-water/70" />
      </div>
      <span className="tabular absolute inset-0 grid place-items-center text-2xl font-semibold text-foreground mix-blend-normal">
        {pct}%
      </span>
      <style>{`@keyframes wave { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
    </div>
  );
}

function GoalDialog({
  open,
  onOpenChange,
  goal,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  goal: number;
  onSave: (v: number) => Promise<unknown>;
}) {
  const [value, setValue] = useState(goal);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Obiettivo acqua</DialogTitle>
          <DialogDescription>Una buona base è circa 30-35 ml per kg di peso corporeo.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <p className="tabular text-4xl font-semibold">
            {value.toLocaleString("it-IT")} <span className="text-base font-normal text-muted-foreground">ml</span>
          </p>
          <Slider min={1000} max={5000} step={50} value={[value]} onValueChange={([v]) => setValue(v)} />
          <Label className="text-xs text-muted-foreground">Da 1 a 5 litri</Label>
        </div>
        <Button
          size="lg"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(value);
              toast.success("Obiettivo aggiornato");
              onOpenChange(false);
            } catch (e) {
              toast.error("Errore", { description: e instanceof Error ? e.message : undefined });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <Loader2 className="animate-spin" />} Salva
        </Button>
      </DialogContent>
    </Dialog>
  );
}
