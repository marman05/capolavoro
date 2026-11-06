import type { Targets } from "@/lib/nutrition";

export function TargetsSummary({ t }: { t: Targets }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl bg-primary p-5 text-primary-foreground">
        <p className="text-sm opacity-85">Obiettivo calorico giornaliero</p>
        <p className="tabular text-4xl font-semibold tracking-tight">
          {t.calorie_goal.toLocaleString("it-IT")} <span className="text-lg font-normal opacity-85">kcal</span>
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Box label="Metabolismo basale" value={`${t.bmr} kcal`} hint="Mifflin-St Jeor" />
        <Box label="Fabbisogno (TDEE)" value={`${t.tdee} kcal`} hint="con livello di attività" />
      </div>
      <div className="grid grid-cols-4 gap-2 rounded-2xl border p-3 text-center">
        <Macro label="Proteine" v={t.protein_goal_g} cls="text-protein" />
        <Macro label="Carbo" v={t.carbs_goal_g} cls="text-carbs" />
        <Macro label="Grassi" v={t.fat_goal_g} cls="text-fat" />
        <div>
          <p className="tabular text-lg font-semibold text-water">{(t.water_goal_ml / 1000).toLocaleString("it-IT")} L</p>
          <p className="text-[11px] text-muted-foreground">Acqua</p>
        </div>
      </div>
    </div>
  );
}

function Box({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular text-xl font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
function Macro({ label, v, cls }: { label: string; v: number; cls: string }) {
  return (
    <div>
      <p className={`tabular text-lg font-semibold ${cls}`}>{v} g</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
