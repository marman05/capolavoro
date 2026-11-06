# FitTrack AI

Web app per monitorare alimentazione, calorie, idratazione e attività fisica, con **riconoscimento del cibo dalle foto tramite AI** (Claude, analisi delle immagini via API).

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui (Radix) · Supabase (Postgres, Auth, Realtime, RLS) · Anthropic Claude API · Open Food Facts + USDA FoodData Central · Recharts.

## Funzionalità

| Sezione | Cosa fa |
| --- | --- |
| **Home** | Anello calorie (obiettivo, mangiate, bruciate, rimanenti calcolate), macro, acqua, minuti di attività, pasti del giorno, messaggio motivazionale. Si aggiorna in tempo reale (Supabase Realtime). |
| **Scansiona piatto** | Foto da fotocamera o galleria → l'immagine viene ridimensionata nel browser e inviata a `/api/ai/analyze-food`, che chiama Claude con output strutturato. L'AI identifica i singoli alimenti, stima i grammi e i valori per 100 g. Gli alimenti incerti (confidenza < 70%) vanno **confermati o sostituiti** (con alternative proposte e ricerca nel database nutrizionale) prima di poter salvare. Quantità e nomi modificabili; scelta del pasto. |
| **Diario** | Colazione, pranzo, cena, spuntini per qualsiasi giorno. Ogni alimento mostra nome, grammi, kcal, proteine, carboidrati, grassi. Ricerca manuale (Open Food Facts, USDA, tabelle CREA), recenti, inserimento manuale, modifica quantità/pasto, eliminazione. |
| **Acqua** | Obiettivo personalizzabile, pulsanti rapidi 150/250/500 ml, quantità libera, grafico cumulativo di oggi, ultimi 7 giorni, percentuale, storico. |
| **Attività** | Camminata, corsa, bici, nuoto, palestra, pesi, calcio, basket, yoga, HIIT. Durata, intensità, distanza (dove applicabile), peso corporeo. Calorie = MET × kg × ore (valori MET dal *Compendium of Physical Activities*; per corsa/camminata/bici il MET viene calcolato dalla velocità se inserisci la distanza). |
| **Progressi** | Grafici settimanali/mensili di calorie assunte e bruciate, macro, acqua, allenamenti; andamento del peso con obiettivo. |
| **Profilo** | Onboarding guidato al primo accesso (età, sesso facoltativo, altezza, peso, peso obiettivo, attività, obiettivo). BMR con Mifflin-St Jeor, TDEE, obiettivi calorici e macro personalizzati (anche manualmente). Tema chiaro/scuro/sistema, promemoria acqua e pasti (in-app + notifiche di sistema), logout. |

## Sicurezza e dati

- Ogni tabella ha **Row Level Security**: un utente legge e scrive solo le proprie righe (`auth.uid() = user_id`).
- Le chiavi AI e nutrizionali restano **solo sul server** (Route Handler); il browser usa solo la chiave pubblica di Supabase.
- Le API server verificano la sessione (`getClaims`) e hanno un rate limit per utente.
- Il `proxy.ts` (ex middleware) aggiorna la sessione e protegge tutte le pagine.

## Avvio

1. **Crea un progetto Supabase** e applica la migrazione `supabase/migrations/20261106000000_init.sql`
   (SQL Editor → incolla ed esegui, oppure `supabase link && supabase db push`).
2. In Supabase → Authentication → URL Configuration aggiungi `http://localhost:3000/auth/callback` (e l'URL di produzione) ai Redirect URLs.
3. Copia `.env.example` in `.env.local` e compila le variabili (`ANTHROPIC_API_KEY` da console.anthropic.com).
4. Avvia:

```bash
npm install
npm run dev
```

Apri http://localhost:3000, registrati e completa l'onboarding.

### Deploy

Funziona su qualsiasi hosting Next.js (es. Vercel): imposta le stesse variabili d'ambiente del file `.env.example`. La route di analisi foto ha `maxDuration = 90` secondi.

## Struttura

```
src/
  app/(app)/          pagine autenticate: home, diario, scansiona, acqua, attivita, progressi, profilo
  app/(auth)/         login e registrazione
  app/onboarding/     procedura guidata del primo accesso
  app/api/ai/analyze-food   analisi foto con Claude (server)
  app/api/foods/search      ricerca alimenti: CREA locale + Open Food Facts + USDA (server)
  components/app/     componenti dell'app (anello calorie, grafici, ricerca alimenti, …)
  components/ui/      componenti shadcn/ui
  lib/                calcoli (nutrizione, MET), accesso dati Supabase, utilità
supabase/migrations/  schema del database con RLS
```

> Le stime di calorie, metabolismo e porzioni sono indicative e non sostituiscono il parere di un medico o di un nutrizionista.
