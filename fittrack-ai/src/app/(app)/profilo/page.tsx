"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Bell, Calculator, Loader2, LogOut, Monitor, Moon, Sun, Target, User } from "lucide-react";
import { useProfile } from "@/components/app/profile-provider";
import { PageHeader } from "@/components/app/page-header";
import { TargetsSummary } from "@/components/app/targets-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACTIVITY_LEVELS, GOALS } from "@/lib/constants";
import { bmi, bmiLabel, calcTargets } from "@/lib/nutrition";
import { createClient } from "@/lib/supabase/client";
import { notificationsSupported, requestNotificationPermission } from "@/lib/notify";
import { cn } from "@/lib/utils";
import type { ActivityLevel, Goal, Sex } from "@/lib/types";

export default function ProfilePage() {
  const { profile, save } = useProfile();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [email, setEmail] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [perm, setPerm] = useState<string>(() => (notificationsSupported() ? Notification.permission : "unsupported"));

  const [body, setBody] = useState({
    name: profile.display_name ?? "",
    age: String(profile.age ?? ""),
    sex: profile.sex as Sex | null,
    height: String(profile.height_cm ?? ""),
    weight: String(profile.weight_kg ?? ""),
    target: profile.target_weight_kg ? String(profile.target_weight_kg) : "",
    activity: (profile.activity_level ?? "light") as ActivityLevel,
    goal: (profile.goal ?? "maintain") as Goal,
  });
  const [custom, setCustom] = useState({
    calories: String(profile.calorie_goal ?? ""),
    protein: String(profile.protein_goal_g ?? ""),
    carbs: String(profile.carbs_goal_g ?? ""),
    fat: String(profile.fat_goal_g ?? ""),
  });

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const n = (s: string) => Number(s.replace(",", "."));
  const bodyValid =
    n(body.age) >= 13 && n(body.age) <= 110 && n(body.height) >= 100 && n(body.height) <= 250 && n(body.weight) >= 30 && n(body.weight) <= 350;
  const preview = bodyValid
    ? calcTargets({
        age: n(body.age),
        sex: body.sex,
        height_cm: n(body.height),
        weight_kg: n(body.weight),
        target_weight_kg: body.target ? n(body.target) : null,
        activity_level: body.activity,
        goal: body.goal,
      })
    : null;
  const bmiValue = bodyValid ? bmi(n(body.weight), n(body.height)) : null;

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error("Impossibile salvare", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Profilo" subtitle={email} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="size-4" /> Dati personali
          </CardTitle>
          <CardDescription>Usati per stimare metabolismo basale e fabbisogno calorico.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Nome" value={body.name} onChange={(v) => setBody({ ...body, name: v })} className="col-span-2" />
            <Field label="Età" value={body.age} onChange={(v) => setBody({ ...body, age: v.replace(/\D/g, "") })} inputMode="numeric" />
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Sesso</Label>
              <Select value={body.sex ?? "none"} onValueChange={(v) => setBody({ ...body, sex: v === "none" ? null : (v as Sex) })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Donna</SelectItem>
                  <SelectItem value="male">Uomo</SelectItem>
                  <SelectItem value="none">Non specificato</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Field label="Altezza (cm)" value={body.height} onChange={(v) => setBody({ ...body, height: v })} inputMode="decimal" />
            <Field label="Peso (kg)" value={body.weight} onChange={(v) => setBody({ ...body, weight: v })} inputMode="decimal" />
            <Field label="Peso obiettivo (kg)" value={body.target} onChange={(v) => setBody({ ...body, target: v })} inputMode="decimal" className="col-span-2 sm:col-span-1" />
            <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
              <Label className="text-xs text-muted-foreground">BMI</Label>
              <div className="flex h-11 items-center rounded-xl bg-muted px-3.5 text-sm">
                {bmiValue ? (
                  <>
                    <b className="tabular mr-1.5">{bmiValue.toFixed(1)}</b> {bmiLabel(bmiValue)}
                  </>
                ) : (
                  "—"
                )}
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Livello di attività</Label>
              <Select value={body.activity} onValueChange={(v) => setBody({ ...body, activity: v as ActivityLevel })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_LEVELS.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label} — {a.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Obiettivo</Label>
              <Select value={body.goal} onValueChange={(v) => setBody({ ...body, goal: v as Goal })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOALS.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {preview && <TargetsSummary t={preview} />}
          <Button
            disabled={!bodyValid || busy !== null}
            onClick={() =>
              run(
                "body",
                async () => {
                  const p = await save({
                    display_name: body.name.trim() || null,
                    age: n(body.age),
                    sex: body.sex,
                    height_cm: n(body.height),
                    weight_kg: n(body.weight),
                    target_weight_kg: body.target ? n(body.target) : null,
                    activity_level: body.activity,
                    goal: body.goal,
                    ...preview!,
                  });
                  setCustom({
                    calories: String(p.calorie_goal),
                    protein: String(p.protein_goal_g),
                    carbs: String(p.carbs_goal_g),
                    fat: String(p.fat_goal_g),
                  });
                },
                "Profilo e obiettivi aggiornati",
              )
            }
          >
            {busy === "body" ? <Loader2 className="animate-spin" /> : <Calculator />} Salva e ricalcola obiettivi
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="size-4" /> Obiettivi personalizzati
          </CardTitle>
          <CardDescription>Imposta manualmente calorie e macronutrienti, se preferisci.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Calorie (kcal)" value={custom.calories} onChange={(v) => setCustom({ ...custom, calories: v.replace(/\D/g, "") })} inputMode="numeric" />
            <Field label="Proteine (g)" value={custom.protein} onChange={(v) => setCustom({ ...custom, protein: v.replace(/\D/g, "") })} inputMode="numeric" />
            <Field label="Carboidrati (g)" value={custom.carbs} onChange={(v) => setCustom({ ...custom, carbs: v.replace(/\D/g, "") })} inputMode="numeric" />
            <Field label="Grassi (g)" value={custom.fat} onChange={(v) => setCustom({ ...custom, fat: v.replace(/\D/g, "") })} inputMode="numeric" />
          </div>
          <p className="tabular text-xs text-muted-foreground">
            Dai macro: {n(custom.protein) * 4 + n(custom.carbs) * 4 + n(custom.fat) * 9} kcal
          </p>
          <Button
            variant="secondary"
            disabled={busy !== null || !(n(custom.calories) >= 800 && n(custom.calories) <= 6000)}
            onClick={() =>
              run(
                "custom",
                () =>
                  save({
                    calorie_goal: n(custom.calories),
                    protein_goal_g: n(custom.protein),
                    carbs_goal_g: n(custom.carbs),
                    fat_goal_g: n(custom.fat),
                  }),
                "Obiettivi salvati",
              )
            }
          >
            {busy === "custom" && <Loader2 className="animate-spin" />} Salva obiettivi
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="size-4" /> Promemoria
            </CardTitle>
            <CardDescription>Avvisi per bere acqua e registrare i pasti mentre l&apos;app è aperta.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="rem">Promemoria attivi</Label>
              <Switch
                id="rem"
                checked={profile.reminders_enabled}
                onCheckedChange={(v) => run("rem", () => save({ reminders_enabled: v }), v ? "Promemoria attivati" : "Promemoria disattivati")}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label>Acqua ogni</Label>
              <Select
                value={String(profile.water_reminder_minutes)}
                onValueChange={(v) => run("int", () => save({ water_reminder_minutes: Number(v) }), "Intervallo aggiornato")}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[30, 60, 90, 120, 180].map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m < 60 ? `${m} minuti` : `${m / 60} ${m === 60 ? "ora" : "ore"}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {perm !== "unsupported" && perm !== "granted" && (
              <Button
                variant="outline"
                onClick={async () => {
                  const r = await requestNotificationPermission();
                  setPerm(r);
                  if (r === "granted") toast.success("Notifiche di sistema attivate");
                  else if (r === "denied") toast.error("Notifiche bloccate dal browser");
                }}
              >
                <Bell /> Attiva notifiche di sistema
              </Button>
            )}
            {perm === "granted" && <p className="text-xs text-muted-foreground">Notifiche di sistema attive ✓</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aspetto e account</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "light", label: "Chiaro", icon: Sun },
                { id: "dark", label: "Scuro", icon: Moon },
                { id: "system", label: "Sistema", icon: Monitor },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-medium transition",
                    theme === t.id ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <t.icon className="size-5" />
                  {t.label}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              className="text-destructive"
              onClick={async () => {
                await createClient().auth.signOut();
                router.replace("/login");
                router.refresh();
              }}
            >
              <LogOut /> Esci
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  className,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const id = `f-${label.replace(/\W/g, "")}`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={id} value={value} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
