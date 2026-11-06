import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/server/session";
import { rateLimit } from "@/lib/server/rate-limit";
import type { FoodAnalysis } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 90;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const MAX_BASE64_BYTES = 6_500_000; // ~4.8 MB di immagine
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

const RequestSchema = z.object({
  image: z.string().min(100),
  mediaType: z.enum(ALLOWED_TYPES),
  hint: z.string().max(300).optional(),
});

const Per100Schema = z.object({
  calories: z.number().describe("kcal per 100 g"),
  protein: z.number().describe("grammi di proteine per 100 g"),
  carbs: z.number().describe("grammi di carboidrati per 100 g"),
  fat: z.number().describe("grammi di grassi per 100 g"),
});

const AnalysisSchema = z.object({
  is_food: z.boolean().describe("false se nella foto non c'è cibo o bevande"),
  dish_description: z.string().describe("breve descrizione del piatto in italiano"),
  items: z.array(
    z.object({
      name: z.string().describe("nome dell'alimento in italiano, specifico (es. 'Spaghetti al pomodoro', 'Petto di pollo alla griglia')"),
      grams: z.number().describe("peso stimato della porzione visibile, in grammi"),
      confidence: z.number().describe("sicurezza del riconoscimento da 0 a 1"),
      needs_confirmation: z
        .boolean()
        .describe("true se l'alimento non è identificabile con certezza e l'utente deve confermarlo o sceglierne un altro"),
      alternatives: z.array(z.string()).describe("se incerto, 1-3 alimenti alternativi plausibili; altrimenti lista vuota"),
      note: z.string().describe("breve nota su ipotesi fatte (condimenti, cottura) o stringa vuota"),
      per100: Per100Schema,
    }),
  ),
  question_for_user: z
    .string()
    .describe("una domanda in italiano per l'utente quando qualcosa è ambiguo, altrimenti stringa vuota"),
});

const SYSTEM_PROMPT = `Sei un nutrizionista esperto che analizza foto di pasti per un'app di conteggio calorie italiana.

Per ogni foto:
1. Identifica ogni alimento o bevanda distinto visibile. Separa i componenti quando è utile per il conteggio (es. pasta, sugo, formaggio grattugiato) ma non frammentare troppo un piatto unico riconoscibile.
2. Stima il peso in grammi di ciò che è effettivamente nel piatto, usando come riferimento dimensioni di piatti, posate, mani o confezioni visibili. Considera il cibo cotto così come appare.
3. Fornisci i valori nutrizionali per 100 g dell'alimento nella forma in cui appare (cotto, condito), basandoti su tabelle nutrizionali standard (CREA, USDA). Includi una stima ragionevole dell'olio o dei condimenti visibili.
4. Sii onesto sull'incertezza: se un alimento non è identificabile con certezza (confidence < 0.7), imposta needs_confirmation a true e proponi alternative plausibili. Non inventare alimenti non visibili.
5. Se nella foto non c'è cibo, restituisci is_food=false e items vuoto.

Usa nomi in italiano. I numeri devono essere realistici e coerenti (le calorie per 100 g devono essere circa 4·proteine + 4·carboidrati + 9·grassi).`;

let anthropic: Anthropic | null = null;
function getClient() {
  if (!anthropic) anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 85_000, maxRetries: 1 });
  return anthropic;
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Servizio AI non configurato: imposta ANTHROPIC_API_KEY nelle variabili d'ambiente del server." },
      { status: 503 },
    );
  }

  const limited = rateLimit(`ai:${userId}`, 30, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Hai raggiunto il limite di analisi per quest'ora. Riprova più tardi." }, { status: 429 });
  }

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }
  const data = body.image.replace(/^data:[^;]+;base64,/, "");
  if (data.length > MAX_BASE64_BYTES) {
    return NextResponse.json({ error: "Immagine troppo grande (max ~5 MB)" }, { status: 413 });
  }

  try {
    const response = await getClient().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: betaZodOutputFormat(AnalysisSchema) },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: body.mediaType, data } },
            {
              type: "text",
              text: body.hint
                ? `Analizza questo pasto. Indicazione dell'utente: "${body.hint}"`
                : "Analizza questo pasto.",
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "L'AI non è riuscita ad analizzare questa immagine. Prova con un'altra foto." }, { status: 422 });
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return NextResponse.json({ error: "Risposta AI incompleta. Riprova." }, { status: 502 });
    }

    const out = response.parsed_output;
    const result: FoodAnalysis = {
      is_food: out.is_food,
      dish_description: out.dish_description,
      question_for_user: out.question_for_user,
      items: out.items
        .filter((i) => i.name.trim() && i.grams > 0)
        .map((i) => {
          const confidence = clamp(i.confidence, 0, 1);
          return {
            name: i.name.trim(),
            grams: Math.round(clamp(i.grams, 1, 3000)),
            confidence,
            needs_confirmation: i.needs_confirmation || confidence < 0.7,
            alternatives: i.alternatives.slice(0, 3),
            note: i.note,
            per100: {
              calories: round1(clamp(i.per100.calories, 0, 900)),
              protein: round1(clamp(i.per100.protein, 0, 100)),
              carbs: round1(clamp(i.per100.carbs, 0, 100)),
              fat: round1(clamp(i.per100.fat, 0, 100)),
            },
          };
        }),
    };
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Servizio AI momentaneamente sovraccarico. Riprova tra poco." }, { status: 429 });
    }
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic: chiave API non valida");
      return NextResponse.json({ error: "Servizio AI non configurato correttamente." }, { status: 503 });
    }
    if (error instanceof Anthropic.BadRequestError) {
      console.error("Anthropic bad request:", error.message);
      return NextResponse.json({ error: "Immagine non supportata. Prova con una foto JPEG o PNG." }, { status: 400 });
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Anthropic API error ${error.status}:`, error.message);
      return NextResponse.json({ error: "Errore del servizio AI. Riprova." }, { status: 502 });
    }
    console.error("analyze-food:", error);
    return NextResponse.json({ error: "Errore imprevisto durante l'analisi." }, { status: 500 });
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : 0));
}
function round1(n: number) {
  return Math.round(n * 10) / 10;
}
