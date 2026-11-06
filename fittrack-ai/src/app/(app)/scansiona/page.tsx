"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  Check,
  ImagePlus,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Replace,
  Sparkles,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { MealSelect } from "@/components/app/meal-select";
import { FoodPicker, NutrientSummary, type PickedFood } from "@/components/app/food-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { prepareImage } from "@/lib/image";
import { addFoodEntries } from "@/lib/data";
import { MEAL_LABEL, mealForNow } from "@/lib/constants";
import { prettyDate, toISODate } from "@/lib/date";
import { round1, scaleNutrients } from "@/lib/nutrition";
import { cn } from "@/lib/utils";
import type { FoodAnalysis, FoodSource, MealType } from "@/lib/types";

interface EditableItem {
  key: string;
  name: string;
  grams: number;
  per100: { calories: number; protein: number; carbs: number; fat: number };
  confidence: number | null;
  needsConfirmation: boolean;
  alternatives: string[];
  note: string;
  source: FoodSource;
}

type Phase = "pick" | "analyzing" | "review";

export default function ScanPage() {
  const router = useRouter();
  // Pagina renderizzata solo nel browser (dopo il caricamento del profilo): window è disponibile.
  const [meal, setMeal] = useState<MealType>(() => {
    const m = new URLSearchParams(window.location.search).get("pasto");
    return m && m in MEAL_LABEL ? (m as MealType) : mealForNow();
  });
  const [date] = useState(() => {
    const d = new URLSearchParams(window.location.search).get("data");
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : toISODate();
  });
  const [hint, setHint] = useState("");
  const [phase, setPhase] = useState<Phase>("pick");
  const [preview, setPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<FoodAnalysis | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ mode: "replace"; key: string; query: string } | { mode: "add" } | null>(null);
  const [saving, setSaving] = useState(false);
  const lastImage = useRef<{ base64: string; mediaType: "image/jpeg" } | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const img = await prepareImage(file);
      lastImage.current = { base64: img.base64, mediaType: img.mediaType };
      setPreview(img.dataUrl);
      await analyze();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossibile leggere l'immagine");
      setPhase("pick");
    }
  }

  async function analyze() {
    if (!lastImage.current) return;
    setPhase("analyzing");
    setError(null);
    try {
      const res = await fetch("/api/ai/analyze-food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: lastImage.current.base64, mediaType: lastImage.current.mediaType, hint: hint.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Analisi non riuscita");
      const a = json as FoodAnalysis;
      setAnalysis(a);
      setItems(
        a.items.map((i, idx) => ({
          key: `${idx}-${i.name}`,
          name: i.name,
          grams: i.grams,
          per100: i.per100,
          confidence: i.confidence,
          needsConfirmation: i.needs_confirmation,
          alternatives: i.alternatives,
          note: i.note,
          source: "ai",
        })),
      );
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analisi non riuscita");
      setPhase(preview ? "review" : "pick");
      setAnalysis(null);
    }
  }

  function reset() {
    setPhase("pick");
    setPreview(null);
    setAnalysis(null);
    setItems([]);
    setError(null);
    lastImage.current = null;
  }

  const update = (key: string, patch: Partial<EditableItem>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  function applyPicked(food: PickedFood) {
    const item: EditableItem = {
      key: `p-${Date.now()}`,
      name: food.name,
      grams: food.grams,
      per100: food.per100,
      confidence: null,
      needsConfirmation: false,
      alternatives: [],
      note: "",
      source: food.source,
    };
    if (picker?.mode === "replace") setItems((prev) => prev.map((i) => (i.key === picker.key ? { ...item, key: i.key } : i)));
    else setItems((prev) => [...prev, item]);
    setPicker(null);
  }

  const totals = items.reduce(
    (acc, i) => {
      const n = scaleNutrients(i.per100, i.grams);
      return { calories: acc.calories + n.calories, protein: acc.protein + n.protein_g, carbs: acc.carbs + n.carbs_g, fat: acc.fat + n.fat_g };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const unconfirmed = items.filter((i) => i.needsConfirmation).length;

  async function save() {
    setSaving(true);
    try {
      await addFoodEntries(
        items.map((i) => ({
          entry_date: date,
          meal_type: meal,
          name: i.name.trim() || "Alimento",
          grams: i.grams,
          source: i.source,
          ...scaleNutrients(i.per100, i.grams),
        })),
      );
      toast.success(`Pasto salvato in ${MEAL_LABEL[meal].toLowerCase()}`, { description: `${Math.round(totals.calories)} kcal` });
      router.push("/diario");
    } catch (e) {
      toast.error("Impossibile salvare", { description: e instanceof Error ? e.message : undefined });
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <PageHeader
        title="Scansiona piatto"
        subtitle={
          <>
            L&apos;AI riconosce gli alimenti e stima porzioni e valori · <span className="capitalize">{prettyDate(date)}</span>
          </>
        }
      />

      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={galleryInput} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />

      {phase === "pick" && (
        <Card className="flex flex-col gap-5 p-5">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => cameraInput.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition active:scale-[0.98] sm:aspect-[4/3]"
            >
              <Camera className="size-9" />
              <span className="font-medium">Scatta foto</span>
            </button>
            <button
              onClick={() => galleryInput.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-muted/40 transition hover:bg-muted active:scale-[0.98] sm:aspect-[4/3]"
            >
              <ImagePlus className="size-9 text-muted-foreground" />
              <span className="font-medium">Dalla galleria</span>
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Aggiungi al pasto</span>
            <MealSelect value={meal} onChange={setMeal} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="hint" className="text-sm font-medium">
              Dettagli per l&apos;AI <span className="font-normal text-muted-foreground">(facoltativo)</span>
            </label>
            <Input id="hint" maxLength={300} placeholder="Es. pasta integrale, condita con poco olio" value={hint} onChange={(e) => setHint(e.target.value)} />
          </div>
          {error && <ErrorBox message={error} />}
          <p className="text-center text-xs text-muted-foreground">
            Consiglio: fotografa dall&apos;alto, con buona luce e il piatto intero nell&apos;inquadratura.
          </p>
        </Card>
      )}

      {phase !== "pick" && preview && (
        <Card className="overflow-hidden p-0">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Foto del pasto" className="max-h-80 w-full object-cover" />
            {phase === "analyzing" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 text-white backdrop-blur-[1px]">
                <div className="relative">
                  <Sparkles className="size-9 animate-pulse" />
                </div>
                <p className="font-medium">Analisi in corso…</p>
                <p className="text-xs text-white/80">Riconoscimento alimenti e stima delle porzioni</p>
                <div className="absolute inset-x-0 top-0 h-1/3 animate-[scan_2s_ease-in-out_infinite] bg-gradient-to-b from-transparent via-white/25 to-transparent" />
              </div>
            )}
          </div>
          {phase === "review" && analysis && (
            <div className="flex items-start gap-3 p-4">
              <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">{analysis.dish_description}</p>
                <p className="text-xs text-muted-foreground">Controlla e correggi i valori prima di salvare.</p>
              </div>
            </div>
          )}
        </Card>
      )}

      {phase === "review" && (
        <>
          {error && <ErrorBox message={error} onRetry={analyze} />}

          {analysis && !analysis.is_food && (
            <Card className="flex flex-col items-center gap-3 p-6 text-center">
              <AlertTriangle className="size-8 text-amber-500" />
              <p className="font-medium">Non ho trovato cibo in questa foto</p>
              <p className="text-sm text-muted-foreground">Prova con un&apos;altra immagine oppure aggiungi gli alimenti manualmente.</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={reset}>
                  Nuova foto
                </Button>
                <Button onClick={() => setPicker({ mode: "add" })}>Aggiungi a mano</Button>
              </div>
            </Card>
          )}

          {analysis?.question_for_user && (
            <div className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
              <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p>{analysis.question_for_user}</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <ItemCard
                key={item.key}
                item={item}
                onChange={(p) => update(item.key, p)}
                onRemove={() => setItems((prev) => prev.filter((i) => i.key !== item.key))}
                onReplace={(query) => setPicker({ mode: "replace", key: item.key, query })}
              />
            ))}
          </div>

          {(analysis?.is_food || items.length > 0) && (
            <Button variant="outline" onClick={() => setPicker({ mode: "add" })}>
              <Plus /> Aggiungi alimento mancante
            </Button>
          )}

          {items.length > 0 && (
            <Card className="flex flex-col gap-3 p-4">
              <span className="text-sm font-semibold">Totale pasto</span>
              <NutrientSummary calories={totals.calories} protein={totals.protein} carbs={totals.carbs} fat={totals.fat} />
              <span className="text-sm font-medium">Aggiungi a</span>
              <MealSelect value={meal} onChange={setMeal} />
            </Card>
          )}

          {items.length > 0 && (
            <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-2 rounded-2xl border bg-card/95 p-2 shadow-lg backdrop-blur lg:bottom-4">
              <Button variant="ghost" size="icon" onClick={reset} aria-label="Nuova foto">
                <RefreshCw />
              </Button>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="tabular text-base font-semibold">{Math.round(totals.calories)} kcal</p>
                <p className="truncate text-xs text-muted-foreground">{MEAL_LABEL[meal]}</p>
              </div>
              <Button disabled={saving || unconfirmed > 0 || items.length === 0} onClick={save}>
                {saving ? <Loader2 className="animate-spin" /> : <Check />}
                {unconfirmed > 0 ? `Conferma ${unconfirmed} ${unconfirmed === 1 ? "alimento" : "alimenti"}` : "Salva nel diario"}
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={picker !== null} onOpenChange={(o) => !o && setPicker(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{picker?.mode === "replace" ? "Sostituisci alimento" : "Aggiungi alimento"}</DialogTitle>
            <DialogDescription>Scegli l&apos;alimento corretto: i valori arrivano dal database nutrizionale.</DialogDescription>
          </DialogHeader>
          {picker && (
            <FoodPicker
              key={picker.mode === "replace" ? picker.key : "add"}
              initialQuery={picker.mode === "replace" ? picker.query : ""}
              confirmLabel={picker.mode === "replace" ? "Sostituisci" : "Aggiungi"}
              onPick={applyPicked}
            />
          )}
        </DialogContent>
      </Dialog>

      <style>{`@keyframes scan { 0% { transform: translateY(-100%); } 100% { transform: translateY(300%); } }`}</style>
    </div>
  );
}

function ItemCard({
  item,
  onChange,
  onRemove,
  onReplace,
}: {
  item: EditableItem;
  onChange: (p: Partial<EditableItem>) => void;
  onRemove: () => void;
  onReplace: (query: string) => void;
}) {
  const n = scaleNutrients(item.per100, item.grams);
  const step = item.grams >= 100 ? 10 : 5;
  const conf = item.confidence;

  return (
    <Card className={cn("flex flex-col gap-3 p-4", item.needsConfirmation && "border-amber-500/50 ring-1 ring-amber-500/30")}>
      <div className="flex items-start gap-2">
        <Input
          value={item.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="h-9 flex-1 border-transparent bg-transparent px-0 text-base font-semibold shadow-none focus-visible:border-input focus-visible:px-2"
          aria-label="Nome alimento"
        />
        {conf !== null && (
          <Badge variant={conf >= 0.8 ? "default" : conf >= 0.6 ? "warning" : "destructive"} className="mt-1.5">
            {Math.round(conf * 100)}%
          </Badge>
        )}
        <Button variant="ghost" size="icon-sm" aria-label="Rimuovi" onClick={onRemove}>
          <Trash2 className="size-4 text-muted-foreground" />
        </Button>
      </div>

      {item.needsConfirmation && (
        <div className="flex flex-col gap-2 rounded-xl bg-amber-500/10 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-300">
            <AlertTriangle className="size-4" /> Non sono sicuro di questo alimento. È corretto?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onChange({ needsConfirmation: false })}>
              <Check /> Sì, confermo
            </Button>
            {item.alternatives.map((alt) => (
              <Button key={alt} size="sm" variant="outline" onClick={() => onReplace(alt)}>
                {alt}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => onReplace(item.name)}>
              <Replace /> Altro…
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button variant="secondary" size="icon-sm" aria-label="Diminuisci" onClick={() => onChange({ grams: Math.max(1, item.grams - step) })}>
          <Minus />
        </Button>
        <div className="relative w-28">
          <Input
            inputMode="decimal"
            value={String(item.grams)}
            onChange={(e) => {
              const v = Number(e.target.value.replace(",", "."));
              if (Number.isFinite(v) && v >= 0 && v <= 5000) onChange({ grams: v });
            }}
            className="h-9 pr-7 text-center tabular"
            aria-label="Grammi"
          />
          <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">g</span>
        </div>
        <Button variant="secondary" size="icon-sm" aria-label="Aumenta" onClick={() => onChange({ grams: item.grams + step })}>
          <Plus />
        </Button>
        <span className="tabular ml-auto text-lg font-semibold">
          {Math.round(n.calories)} <span className="text-xs font-normal text-muted-foreground">kcal</span>
        </span>
      </div>

      <div className="tabular flex justify-between text-xs text-muted-foreground">
        <span>
          <b className="text-protein">P</b> {round1(n.protein_g)} g
        </span>
        <span>
          <b className="text-carbs">C</b> {round1(n.carbs_g)} g
        </span>
        <span>
          <b className="text-fat">G</b> {round1(n.fat_g)} g
        </span>
        {!item.needsConfirmation && (
          <button className="font-medium text-primary" onClick={() => onReplace(item.name)}>
            Correggi
          </button>
        )}
      </div>
      {item.note && <p className="text-xs text-muted-foreground italic">{item.note}</p>}
    </Card>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
      <AlertTriangle className="size-5 shrink-0 text-destructive" />
      <p className="flex-1">{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Riprova
        </Button>
      )}
    </div>
  );
}
