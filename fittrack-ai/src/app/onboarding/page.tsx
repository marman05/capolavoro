"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { useProfile } from "@/components/app/profile-provider";
import { Logo } from "@/components/app/logo";
import { OptionCard } from "@/components/app/option-card";
import { TargetsSummary } from "@/components/app/targets-summary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ACTIVITY_LEVELS, GOALS } from "@/lib/constants";
import { calcTargets } from "@/lib/nutrition";
import { upsertWeight } from "@/lib/data";
import { toISODate } from "@/lib/date";
import type { ActivityLevel, Goal, Sex } from "@/lib/types";

const STEPS = ["Benvenuto", "Su di te", "Corpo", "Attività", "Obiettivo", "Riepilogo"];

export default function OnboardingPage() {
  const { profile, save } = useProfile();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: profile.display_name ?? "",
    age: profile.age ? String(profile.age) : "",
    sex: profile.sex as Sex | null,
    height: profile.height_cm ? String(profile.height_cm) : "",
    weight: profile.weight_kg ? String(profile.weight_kg) : "",
    target: profile.target_weight_kg ? String(profile.target_weight_kg) : "",
    activity: (profile.activity_level ?? "light") as ActivityLevel,
    goal: (profile.goal ?? "maintain") as Goal,
  });
  const n = (s: string) => Number(s.replace(",", "."));

  const valid = [
    true,
    n(f.age) >= 13 && n(f.age) <= 110,
    n(f.height) >= 100 && n(f.height) <= 250 && n(f.weight) >= 30 && n(f.weight) <= 350 && (!f.target || (n(f.target) >= 30 && n(f.target) <= 350)),
    true,
    true,
    true,
  ];

  const targets =
    step >= 5
      ? calcTargets({
          age: n(f.age),
          sex: f.sex,
          height_cm: n(f.height),
          weight_kg: n(f.weight),
          target_weight_kg: f.target ? n(f.target) : null,
          activity_level: f.activity,
          goal: f.goal,
        })
      : null;

  async function finish() {
    if (!targets) return;
    setBusy(true);
    try {
      await save({
        display_name: f.name.trim() || null,
        age: n(f.age),
        sex: f.sex,
        height_cm: n(f.height),
        weight_kg: n(f.weight),
        target_weight_kg: f.target ? n(f.target) : null,
        activity_level: f.activity,
        goal: f.goal,
        ...targets,
        onboarded: true,
      });
      await upsertWeight(toISODate(), n(f.weight)).catch(() => undefined);
      toast.success("Profilo pronto! Iniziamo 💪");
      router.replace("/");
    } catch (e) {
      toast.error("Impossibile salvare", { description: e instanceof Error ? e.message : undefined });
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between">
        <Logo />
        <span className="text-xs text-muted-foreground">
          {step + 1} / {STEPS.length}
        </span>
      </div>
      <Progress value={((step + 1) / STEPS.length) * 100} className="mt-5 h-1.5" />

      <div key={step} className="animate-fade-up mt-8 flex flex-1 flex-col gap-5">
        {step === 0 && (
          <>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Benvenuto in FitTrack AI</h1>
              <p className="mt-2 text-muted-foreground">
                Rispondi a poche domande: calcoleremo il tuo metabolismo basale e gli obiettivi di calorie, macronutrienti e acqua.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Come ti chiami?</Label>
              <Input id="name" placeholder="Il tuo nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={40} />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Qualcosa su di te</h1>
            <div className="flex flex-col gap-2">
              <Label htmlFor="age">Età</Label>
              <Input id="age" inputMode="numeric" placeholder="Es. 30" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value.replace(/\D/g, "") })} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>
                Sesso <span className="font-normal text-muted-foreground">(facoltativo)</span>
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "female", label: "Donna" },
                  { id: "male", label: "Uomo" },
                  { id: null, label: "Preferisco non dirlo" },
                ].map((o) => (
                  <Button
                    key={String(o.id)}
                    type="button"
                    variant={f.sex === o.id ? "default" : "outline"}
                    className="h-auto min-h-11 py-2 whitespace-normal"
                    onClick={() => setF({ ...f, sex: o.id as Sex | null })}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Serve solo per stimare meglio il metabolismo basale.</p>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Le tue misure</h1>
            <div className="flex flex-col gap-2">
              <Label htmlFor="h">Altezza (cm)</Label>
              <Input id="h" inputMode="decimal" placeholder="Es. 172" value={f.height} onChange={(e) => setF({ ...f, height: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="w">Peso attuale (kg)</Label>
                <Input id="w" inputMode="decimal" placeholder="Es. 75" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="t">Peso obiettivo (kg)</Label>
                <Input id="t" inputMode="decimal" placeholder="Es. 70" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} />
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Quanto sei attivo?</h1>
              <p className="mt-1 text-sm text-muted-foreground">Pensa a una settimana tipica.</p>
            </div>
            <div className="flex flex-col gap-2">
              {ACTIVITY_LEVELS.map((a) => (
                <OptionCard key={a.id} selected={f.activity === a.id} onClick={() => setF({ ...f, activity: a.id })} title={a.label} description={a.description} />
              ))}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Qual è il tuo obiettivo?</h1>
            <div className="flex flex-col gap-2">
              {GOALS.map((g, i) => (
                <OptionCard
                  key={g.id}
                  icon={["📉", "⚖️", "💪"][i]}
                  selected={f.goal === g.id}
                  onClick={() => setF({ ...f, goal: g.id })}
                  title={g.label}
                  description={g.description}
                />
              ))}
            </div>
          </>
        )}

        {step === 5 && targets && (
          <>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Il tuo piano{f.name ? `, ${f.name}` : ""}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Potrai modificare tutto in qualsiasi momento dal profilo.</p>
            </div>
            <TargetsSummary t={targets} />
            <p className="text-xs text-muted-foreground">
              Stime indicative, non sostituiscono il parere di un medico o di un nutrizionista. Le calorie degli allenamenti registrati
              vengono aggiunte al budget giornaliero.
            </p>
          </>
        )}
      </div>

      <div className="mt-8 grid grid-cols-[auto_1fr] gap-2">
        <Button variant="outline" size="lg" disabled={step === 0 || busy} onClick={() => setStep(step - 1)} aria-label="Indietro">
          <ArrowLeft />
        </Button>
        {step < STEPS.length - 1 ? (
          <Button size="lg" disabled={!valid[step]} onClick={() => setStep(step + 1)}>
            Continua <ArrowRight />
          </Button>
        ) : (
          <Button size="lg" disabled={busy} onClick={finish}>
            {busy && <Loader2 className="animate-spin" />} Inizia
          </Button>
        )}
      </div>
    </div>
  );
}
