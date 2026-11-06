"use client";

import Link from "next/link";
import { Activity, Camera, ChevronRight, Droplets, Flame, Search, Target, Timer, Utensils } from "lucide-react";
import { useProfile } from "@/components/app/profile-provider";
import { CalorieRing } from "@/components/app/calorie-ring";
import { MacroBar } from "@/components/app/macro-bar";
import { StatTile } from "@/components/app/stat-tile";
import { WaterQuickAdd } from "@/components/app/water-quick-add";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToday } from "@/hooks/use-today";
import { useDayData } from "@/hooks/use-day-data";
import { foodTotals, mealTotals, waterTotal, workoutTotals } from "@/lib/totals";
import { MEALS } from "@/lib/constants";
import { motivationalMessage } from "@/lib/motivation";
import { prettyDate } from "@/lib/date";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
}

export default function DashboardPage() {
  const { profile } = useProfile();
  const today = useToday();
  const { data, reload } = useDayData(today);

  if (!data) return <DashboardSkeleton />;

  const goal = profile.calorie_goal ?? 2000;
  const food = foodTotals(data.foods);
  const wk = workoutTotals(data.workouts);
  const water = waterTotal(data.water);
  const waterPct = Math.round((water / profile.water_goal_ml) * 100);
  const remaining = Math.round(goal - food.calories + wk.burned);
  const msg = motivationalMessage({
    eaten: food.calories,
    goal,
    burned: wk.burned,
    waterMl: water,
    waterGoal: profile.water_goal_ml,
    workouts: wk.count,
    protein: food.protein,
    proteinGoal: profile.protein_goal_g ?? 0,
    hour: new Date().getHours(),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="animate-fade-up">
        <p className="text-sm text-muted-foreground capitalize">{prettyDate(today)}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {greeting()}
          {profile.display_name ? `, ${profile.display_name}` : ""} 👋
        </h1>
      </div>

      <div className="animate-fade-up flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/8 px-4 py-3 text-sm [animation-delay:60ms]">
        <span className="text-xl">{msg.emoji}</span>
        <p className="text-foreground/90">{msg.text}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="animate-fade-up lg:col-span-3 [animation-delay:100ms]">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Calorie di oggi</CardTitle>
            <Link href="/diario" className="flex items-center text-xs font-medium text-primary">
              Diario <ChevronRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6 sm:flex-row sm:justify-around">
            <CalorieRing goal={goal} eaten={food.calories} burned={wk.burned} size={220} />
            <dl className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:grid-cols-1">
              <RingStat icon={<Target className="size-4" />} label="Obiettivo" value={goal} color="var(--muted-foreground)" />
              <RingStat icon={<Utensils className="size-4" />} label="Mangiate" value={food.calories} color="var(--primary)" />
              <RingStat icon={<Flame className="size-4" />} label="Bruciate" value={wk.burned} color="var(--burn)" />
              <RingStat
                icon={<Activity className="size-4" />}
                label={remaining < 0 ? "Oltre obiettivo" : "Disponibili"}
                value={Math.abs(remaining)}
                color={remaining < 0 ? "var(--destructive)" : "var(--foreground)"}
              />
            </dl>
          </CardContent>
        </Card>

        <Card className="animate-fade-up lg:col-span-2 [animation-delay:140ms]">
          <CardHeader>
            <CardTitle>Macronutrienti</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <MacroBar label="Proteine" value={food.protein} goal={profile.protein_goal_g ?? 0} colorClass="bg-protein" />
            <MacroBar label="Carboidrati" value={food.carbs} goal={profile.carbs_goal_g ?? 0} colorClass="bg-carbs" />
            <MacroBar label="Grassi" value={food.fat} goal={profile.fat_goal_g ?? 0} colorClass="bg-fat" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<Droplets className="size-4" />}
          accent="var(--water)"
          label="Acqua"
          value={(water / 1000).toLocaleString("it-IT", { maximumFractionDigits: 2 })}
          unit={`/ ${(profile.water_goal_ml / 1000).toLocaleString("it-IT")} L`}
          hint={<Progress value={waterPct} indicatorClassName="bg-water" className="mt-1 h-1.5" />}
        />
        <StatTile
          icon={<Timer className="size-4" />}
          accent="var(--primary)"
          label="Attività"
          value={wk.minutes}
          unit="min"
          hint={`${wk.count} ${wk.count === 1 ? "allenamento" : "allenamenti"}`}
        />
        <StatTile
          icon={<Flame className="size-4" />}
          accent="var(--burn)"
          label="Bruciate"
          value={Math.round(wk.burned)}
          unit="kcal"
          hint="da allenamenti"
        />
        <StatTile
          icon={<Utensils className="size-4" />}
          accent="var(--carbs)"
          label="Alimenti"
          value={data.foods.length}
          hint="registrati oggi"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="animate-fade-up">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Droplets className="size-4 text-water" /> Idratazione
            </CardTitle>
            <span className="tabular text-sm font-semibold text-water">{waterPct}%</span>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <WaterQuickAdd date={today} onAdded={reload} />
            <Link href="/acqua" className="text-center text-xs font-medium text-muted-foreground hover:text-foreground">
              Vedi storico e grafico →
            </Link>
          </CardContent>
        </Card>

        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle>Azioni rapide</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2">
            <QuickAction href="/scansiona" icon={<Camera className="size-5" />} label="Foto AI" primary />
            <QuickAction href="/diario?cerca=1" icon={<Search className="size-5" />} label="Cerca cibo" />
            <QuickAction href="/attivita" icon={<Activity className="size-5" />} label="Allenamento" />
          </CardContent>
        </Card>
      </div>

      <Card className="animate-fade-up">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Pasti di oggi</CardTitle>
          <Link href="/diario" className="flex items-center text-xs font-medium text-primary">
            Apri diario <ChevronRight className="size-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {MEALS.map((m) => {
            const t = mealTotals(data.foods, m.id);
            const count = data.foods.filter((f) => f.meal_type === m.id).length;
            return (
              <Link
                key={m.id}
                href={`/diario#${m.id}`}
                className="flex items-center gap-3 rounded-xl bg-muted/60 p-3 transition hover:bg-muted"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-card text-lg">{m.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{m.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {count ? `${count} ${count === 1 ? "alimento" : "alimenti"}` : "Nessun alimento"}
                  </p>
                </div>
                <span className="tabular text-sm font-semibold">{Math.round(t.calories)} kcal</span>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function RingStat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5 sm:min-w-44">
      <span style={{ color }}>{icon}</span>
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="tabular text-base font-semibold">{Math.round(value).toLocaleString("it-IT")} kcal</dd>
      </div>
    </div>
  );
}

function QuickAction({ href, icon, label, primary }: { href: string; icon: React.ReactNode; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "flex flex-col items-center gap-2 rounded-xl bg-primary p-3 text-xs font-medium text-primary-foreground transition active:scale-95"
          : "flex flex-col items-center gap-2 rounded-xl bg-muted p-3 text-xs font-medium transition hover:bg-muted/70 active:scale-95"
      }
    >
      {icon}
      {label}
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-12 w-60" />
      <Skeleton className="h-12 w-full" />
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-80 lg:col-span-3" />
        <Skeleton className="h-80 lg:col-span-2" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    </div>
  );
}
