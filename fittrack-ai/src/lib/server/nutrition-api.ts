import "server-only";
import type { FoodSearchResult } from "@/lib/types";

const TIMEOUT_MS = 5000;
const USER_AGENT = process.env.OFF_USER_AGENT || "FitTrackAI/1.0 (nutrition tracker web app)";

async function fetchJson(url: string, init?: RequestInit) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Open Food Facts: ottimo per prodotti confezionati venduti in Italia. Nessuna chiave richiesta. */
export async function searchOpenFoodFacts(q: string, limit = 10): Promise<FoodSearchResult[]> {
  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.searchParams.set("search_terms", q);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", String(limit * 2));
  url.searchParams.set("lc", "it");
  url.searchParams.set("fields", "code,product_name,product_name_it,brands,nutriments,serving_quantity");

  type OffProduct = {
    code?: string;
    product_name?: string;
    product_name_it?: string;
    brands?: string;
    serving_quantity?: number | string;
    nutriments?: Record<string, number | string | undefined>;
  };
  const json = (await fetchJson(url.toString(), { headers: { "User-Agent": USER_AGENT } })) as { products?: OffProduct[] };
  const out: FoodSearchResult[] = [];
  for (const p of json.products ?? []) {
    const n = p.nutriments ?? {};
    const num = (k: string) => Number(n[k]);
    let kcal = num("energy-kcal_100g");
    if (!Number.isFinite(kcal) && Number.isFinite(num("energy_100g"))) kcal = num("energy_100g") / 4.184;
    const protein = num("proteins_100g");
    const carbs = num("carbohydrates_100g");
    const fat = num("fat_100g");
    const name = (p.product_name_it || p.product_name || "").trim();
    if (!name || ![kcal, protein, carbs, fat].every(Number.isFinite)) continue;
    const serving = Number(p.serving_quantity);
    out.push({
      id: `off-${p.code ?? name}`,
      name,
      brand: p.brands?.split(",")[0]?.trim() || undefined,
      source: "openfoodfacts",
      per100: { calories: Math.round(kcal), protein: r1(protein), carbs: r1(carbs), fat: r1(fat) },
      servingGrams: Number.isFinite(serving) && serving > 0 ? serving : undefined,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** USDA FoodData Central: alimenti generici (nomi in inglese). Chiave gratuita su fdc.nal.usda.gov. */
export async function searchUSDA(q: string, limit = 8): Promise<FoodSearchResult[]> {
  const key = process.env.FDC_API_KEY;
  if (!key) return [];
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", key);
  url.searchParams.set("query", q);
  url.searchParams.set("pageSize", String(limit));
  url.searchParams.set("dataType", "Foundation,SR Legacy,Survey (FNDDS)");

  type UsdaNutrient = { nutrientId?: number; nutrientNumber?: string; value?: number; unitName?: string };
  type UsdaFood = { fdcId: number; description: string; brandOwner?: string; foodNutrients?: UsdaNutrient[] };
  const json = (await fetchJson(url.toString())) as { foods?: UsdaFood[] };

  return (json.foods ?? [])
    .map((f): FoodSearchResult | null => {
      const get = (ids: number[], nums: string[]) =>
        f.foodNutrients?.find((x) => (x.nutrientId && ids.includes(x.nutrientId)) || (x.nutrientNumber && nums.includes(x.nutrientNumber)))
          ?.value;
      const protein = get([1003], ["203"]) ?? 0;
      const fat = get([1004], ["204"]) ?? 0;
      const carbs = get([1005], ["205"]) ?? 0;
      const kcal = get([1008, 2047, 2048], ["208", "957", "958"]) ?? protein * 4 + carbs * 4 + fat * 9;
      if (!kcal && !protein && !carbs && !fat) return null;
      return {
        id: `usda-${f.fdcId}`,
        name: capitalize(f.description),
        brand: f.brandOwner,
        source: "usda",
        per100: { calories: Math.round(kcal), protein: r1(protein), carbs: r1(carbs), fat: r1(fat) },
      };
    })
    .filter((x): x is FoodSearchResult => x !== null);
}

function capitalize(s: string) {
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
