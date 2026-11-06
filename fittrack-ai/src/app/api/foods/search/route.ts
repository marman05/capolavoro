import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { searchLocalFoods } from "@/lib/foods-local";
import { searchOpenFoodFacts, searchUSDA } from "@/lib/server/nutrition-api";
import { rateLimit } from "@/lib/server/rate-limit";
import type { FoodSearchResult } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { userId } = await getAuthUser();
  if (!userId) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [], sources: [] });
  if (q.length > 80) return NextResponse.json({ error: "Ricerca troppo lunga" }, { status: 400 });

  if (!rateLimit(`search:${userId}`, 120, 60_000).ok) {
    return NextResponse.json({ error: "Troppe ricerche, attendi un momento." }, { status: 429 });
  }

  const local = searchLocalFoods(q, 6);
  const [off, usda] = await Promise.allSettled([searchOpenFoodFacts(q, 10), searchUSDA(q, 6)]);

  const failed: string[] = [];
  if (off.status === "rejected") failed.push("Open Food Facts");
  if (usda.status === "rejected") failed.push("USDA");

  const seen = new Set<string>();
  const results: FoodSearchResult[] = [];
  for (const r of [...local, ...(off.status === "fulfilled" ? off.value : []), ...(usda.status === "fulfilled" ? usda.value : [])]) {
    const key = `${r.name.toLowerCase()}|${r.brand?.toLowerCase() ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(r);
  }
  return NextResponse.json({ results: results.slice(0, 24), failed });
}
