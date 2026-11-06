"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, PenLine, Search, History, ChevronLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getRecentFoods } from "@/lib/data";
import { scaleNutrients } from "@/lib/nutrition";
import type { FoodSearchResult, FoodSource } from "@/lib/types";

export interface PickedFood {
  name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: FoodSource;
  per100: { calories: number; protein: number; carbs: number; fat: number };
}

const SOURCE_LABEL: Record<FoodSearchResult["source"], string> = {
  local: "Generico",
  openfoodfacts: "Open Food Facts",
  usda: "USDA",
};

/** Ricerca alimenti (API nutrizionale), recenti e inserimento manuale. */
export function FoodPicker({
  initialQuery = "",
  confirmLabel = "Aggiungi",
  onPick,
  extra,
}: {
  initialQuery?: string;
  confirmLabel?: string;
  onPick: (food: PickedFood) => void | Promise<void>;
  extra?: React.ReactNode;
}) {
  const [tab, setTab] = useState("search");
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<FoodSearchResult | null>(null);
  const [recent, setRecent] = useState<FoodSearchResult[] | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/foods/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setResults(json.results ?? []);
        setFailed(json.failed ?? []);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setResults([]);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
      setLoading(false);
    };
  }, [query]);

  useEffect(() => {
    if (tab !== "recent" || recent) return;
    getRecentFoods()
      .then((rows) =>
        setRecent(
          rows.map((r) => ({
            id: r.id,
            name: r.name,
            source: "local" as const,
            servingGrams: r.grams,
            per100: {
              calories: (r.calories / r.grams) * 100,
              protein: (r.protein_g / r.grams) * 100,
              carbs: (r.carbs_g / r.grams) * 100,
              fat: (r.fat_g / r.grams) * 100,
            },
          })),
        ),
      )
      .catch(() => setRecent([]));
  }, [tab, recent]);

  if (selected) {
    return (
      <PortionStep
        food={selected}
        confirmLabel={confirmLabel}
        onBack={() => setSelected(null)}
        onConfirm={(grams) => onPick({ name: selected.brand ? `${selected.name} (${selected.brand})` : selected.name, grams, source: "search", per100: selected.per100, ...scaleNutrients(selected.per100, grams) })}
        extra={extra}
      />
    );
  }

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="w-full">
        <TabsTrigger value="search">
          <Search className="size-4" /> Cerca
        </TabsTrigger>
        <TabsTrigger value="recent">
          <History className="size-4" /> Recenti
        </TabsTrigger>
        <TabsTrigger value="manual">
          <PenLine className="size-4" /> Manuale
        </TabsTrigger>
      </TabsList>

      <TabsContent value="search" className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Es. yogurt greco, pasta, banana…"
            className="pl-10"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {loading && <Loader2 className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
        <ResultList items={query.trim().length >= 2 ? results : []} onSelect={setSelected} />
        {!loading && query.trim().length >= 2 && results.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nessun risultato. Prova un altro termine o inseriscilo manualmente.
          </p>
        )}
        {failed.length > 0 && (
          <p className="text-center text-xs text-muted-foreground">Fonte non raggiungibile: {failed.join(", ")}</p>
        )}
        {query.trim().length < 2 && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Dati da Open Food Facts, USDA FoodData Central e tabelle CREA.
          </p>
        )}
      </TabsContent>

      <TabsContent value="recent">
        {recent === null ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : recent.length ? (
          <ResultList items={recent} onSelect={setSelected} hideSource />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Gli alimenti che registri compariranno qui.</p>
        )}
      </TabsContent>

      <TabsContent value="manual">
        <ManualForm confirmLabel={confirmLabel} onPick={onPick} extra={extra} />
      </TabsContent>
    </Tabs>
  );
}

function ResultList({
  items,
  onSelect,
  hideSource,
}: {
  items: FoodSearchResult[];
  onSelect: (f: FoodSearchResult) => void;
  hideSource?: boolean;
}) {
  return (
    <ul className="flex max-h-[50dvh] flex-col gap-1 overflow-y-auto">
      {items.map((f) => (
        <li key={f.id}>
          <button
            className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition hover:bg-muted"
            onClick={() => onSelect(f)}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{f.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {f.brand ? `${f.brand} · ` : ""}P {f.per100.protein.toFixed(0)} · C {f.per100.carbs.toFixed(0)} · G{" "}
                {f.per100.fat.toFixed(0)} per 100 g
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="tabular text-sm font-semibold">{Math.round(f.per100.calories)}</span>
              {!hideSource && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                  {SOURCE_LABEL[f.source]}
                </Badge>
              )}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function PortionStep({
  food,
  confirmLabel,
  onBack,
  onConfirm,
  extra,
}: {
  food: FoodSearchResult;
  confirmLabel: string;
  onBack: () => void;
  onConfirm: (grams: number) => void | Promise<void>;
  extra?: React.ReactNode;
}) {
  const [grams, setGrams] = useState(String(Math.round(food.servingGrams ?? 100)));
  const [busy, setBusy] = useState(false);
  const g = Number(grams.replace(",", "."));
  const valid = Number.isFinite(g) && g > 0 && g <= 5000;
  const n = useMemo(() => scaleNutrients(food.per100, valid ? g : 0), [food, g, valid]);
  const presets = Array.from(new Set([food.servingGrams ? Math.round(food.servingGrams) : null, 50, 100, 150, 200].filter(Boolean))) as number[];

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Indietro
      </button>
      <div>
        <p className="font-semibold">{food.name}</p>
        {food.brand && <p className="text-sm text-muted-foreground">{food.brand}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="grams">Quantità (g)</Label>
        <Input id="grams" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} aria-invalid={!valid} />
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <Button key={p} type="button" size="sm" variant="secondary" onClick={() => setGrams(String(p))}>
              {p} g
            </Button>
          ))}
        </div>
      </div>
      <NutrientSummary calories={n.calories} protein={n.protein_g} carbs={n.carbs_g} fat={n.fat_g} />
      {extra}
      <Button
        size="lg"
        disabled={!valid || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm(g);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy && <Loader2 className="animate-spin" />} {confirmLabel}
      </Button>
    </div>
  );
}

export function NutrientSummary({ calories, protein, carbs, fat }: { calories: number; protein: number; carbs: number; fat: number }) {
  return (
    <div className="grid grid-cols-4 gap-2 rounded-2xl bg-muted/60 p-3 text-center">
      {[
        ["kcal", calories, "text-foreground"],
        ["Proteine", protein, "text-protein"],
        ["Carbo", carbs, "text-carbs"],
        ["Grassi", fat, "text-fat"],
      ].map(([label, v, cls]) => (
        <div key={label as string}>
          <p className={`tabular text-lg font-semibold ${cls}`}>{Math.round(v as number)}</p>
          <p className="text-[11px] text-muted-foreground">{label as string}</p>
        </div>
      ))}
    </div>
  );
}

function ManualForm({
  confirmLabel,
  onPick,
  extra,
}: {
  confirmLabel: string;
  onPick: (food: PickedFood) => void | Promise<void>;
  extra?: React.ReactNode;
}) {
  const [f, setF] = useState({ name: "", grams: "100", calories: "", protein: "", carbs: "", fat: "" });
  const [busy, setBusy] = useState(false);
  const toNum = (s: string) => Number(s.replace(",", ".") || 0);
  const grams = toNum(f.grams);
  const valid = f.name.trim().length > 0 && grams > 0 && grams <= 5000 && toNum(f.calories) >= 0 && f.calories !== "";

  const field = (key: keyof typeof f, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`m-${key}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={`m-${key}`} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} {...props} />
    </div>
  );

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        const cal = toNum(f.calories), p = toNum(f.protein), c = toNum(f.carbs), fa = toNum(f.fat);
        try {
          await onPick({
            name: f.name.trim(),
            grams,
            calories: cal,
            protein_g: p,
            carbs_g: c,
            fat_g: fa,
            source: "manual",
            per100: { calories: (cal / grams) * 100, protein: (p / grams) * 100, carbs: (c / grams) * 100, fat: (fa / grams) * 100 },
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      {field("name", "Nome alimento", { placeholder: "Es. Insalata di riso della nonna", autoFocus: true })}
      <div className="grid grid-cols-2 gap-3">
        {field("grams", "Quantità (g)", { inputMode: "decimal" })}
        {field("calories", "Calorie (kcal)", { inputMode: "decimal", placeholder: "per la porzione" })}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {field("protein", "Proteine (g)", { inputMode: "decimal", placeholder: "0" })}
        {field("carbs", "Carboidrati (g)", { inputMode: "decimal", placeholder: "0" })}
        {field("fat", "Grassi (g)", { inputMode: "decimal", placeholder: "0" })}
      </div>
      {extra}
      <Button size="lg" type="submit" disabled={!valid || busy}>
        {busy && <Loader2 className="animate-spin" />} {confirmLabel}
      </Button>
    </form>
  );
}
