import Anthropic from '@anthropic-ai/sdk';
import { Router } from 'express';
import { z } from 'zod';

/**
 * Proxy verso la Claude API per l'AI Financial Assistant.
 * La API key resta sul server (variabile d'ambiente) e non viene mai inviata al browser.
 * Il browser invia un RIEPILOGO AGGREGATO dei dati (vedi buildAiContext) solo dopo il
 * consenso esplicito dell'utente; nessun IBAN, nessuna credenziale.
 */

const SYSTEM = `Sei l'assistente finanziario personale di un'app di analisi in SOLA LETTURA che aggrega i conti Revolut (piano Metal) e Trade Republic dell'utente.

Regole:
- Rispondi in italiano, in modo concreto e conciso (massimo ~250 parole salvo richiesta), usando elenchi puntati quando aiutano.
- Basati ESCLUSIVAMENTE sui dati del contesto JSON fornito. Se un dato non c'è, dillo chiaramente e spiega come ottenerlo (es. importare un file, verificare una condizione del piano).
- Indica sempre il periodo analizzato (date) all'inizio della risposta.
- Distingui esplicitamente i FATTI (importi presenti nei dati) dalle STIME (proiezioni, valori dei vantaggi, risparmi potenziali): usa le etichette "Fatto:" e "Stima:" quando mescoli i due.
- I campi con "Estimate", "reconstructed", "priceIsEstimate" o "assumption" sono stime: trattali come tali.
- I vantaggi Revolut Metal con status "unverified" non sono confermati per il paese/piano dell'utente: non darli per disponibili.
- Se isDemoData è true, ricorda che si tratta di dati dimostrativi.
- Non dare consigli personalizzati di acquisto o vendita di specifici strumenti finanziari e non presentare le simulazioni come rendimenti garantiti. Puoi spiegare concetti (diversificazione, costi, fondo emergenza) e indicare quali aspetti valutare.
- L'app non può eseguire bonifici, pagamenti o ordini: se l'utente lo chiede, spiega che deve farlo dall'app della banca/broker.
- Importi in euro con formato italiano (es. 1.234,56 €).`;

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(30),
  context: z.record(z.string(), z.unknown()),
});

export function aiRouter() {
  const configured = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  const model = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
  const client = configured ? new Anthropic() : null;
  const r = Router();

  r.post('/chat', async (req, res) => {
    if (!client) return res.status(503).json({ error: "Assistente AI non configurato: imposta ANTHROPIC_API_KEY nel file .env del server." });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Richiesta non valida' });
    const { messages, context } = parsed.data;
    const contextJson = JSON.stringify(context);
    if (contextJson.length > 400_000) return res.status(413).json({ error: 'Contesto troppo grande' });

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const controller = new AbortController();
    res.on('close', () => controller.abort());

    try {
      const stream = client.beta.messages.stream(
        {
          model,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          thinking: { type: 'adaptive' },
          output_config: { effort: 'medium' },
          system: [
            { type: 'text', text: SYSTEM },
            // il contesto cambia solo quando cambiano i dati: in cache tra le domande della stessa sessione
            { type: 'text', text: `Contesto dati dell'utente (JSON):\n${contextJson}`, cache_control: { type: 'ephemeral' } },
          ],
          messages,
        },
        { signal: controller.signal },
      );
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') send('delta', { text: event.delta.text });
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal') send('error', { error: 'La richiesta non può essere elaborata. Prova a riformularla.' });
      send('done', { model: final.model, stop_reason: final.stop_reason });
    } catch (e) {
      if (controller.signal.aborted) return;
      let message = 'Errore del servizio AI';
      if (e instanceof Anthropic.AuthenticationError) message = 'API key non valida';
      else if (e instanceof Anthropic.RateLimitError) message = 'Limite di richieste raggiunto, riprova tra poco';
      else if (e instanceof Anthropic.APIConnectionError) message = 'Servizio AI non raggiungibile';
      else if (e instanceof Anthropic.APIError) message = `Errore AI (${e.status})`;
      console.error('[ai]', e);
      send('error', { error: message });
    } finally {
      res.end();
    }
  });

  return { router: r, configured, model };
}
