# FitTrack AI

Web app per monitorare alimentazione, calorie, idratazione e attività fisica, con **riconoscimento del cibo dalle foto tramite AI** (Claude, analisi delle immagini via API).

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui (Radix) · Neon Postgres · Better Auth (email e password) · Anthropic Claude API · Open Food Facts + USDA FoodData Central · Recharts.

## Funzionalità

| Sezione | Cosa fa |
| --- | --- |
| **Home** | Anello calorie (obiettivo, mangiate, bruciate, rimanenti calcolate), macro, acqua, minuti di attività, pasti del giorno, messaggio motivazionale. Si aggiorna subito dopo ogni salvataggio, anche nelle altre schede, e quando l'app torna in primo piano. |
| **Scansiona piatto** | Foto da fotocamera o galleria → l'immagine viene ridimensionata nel browser e inviata a `/api/ai/analyze-food`, che chiama Claude con output strutturato. L'AI identifica i singoli alimenti, stima i grammi e i valori per 100 g. Gli alimenti incerti (confidenza < 70%) vanno **confermati o sostituiti** (con alternative proposte e ricerca nel database nutrizionale) prima di poter salvare. Quantità e nomi modificabili; scelta del pasto. |
| **Diario** | Colazione, pranzo, cena, spuntini per qualsiasi giorno. Ogni alimento mostra nome, grammi, kcal, proteine, carboidrati, grassi. Ricerca manuale (Open Food Facts, USDA, tabelle CREA), recenti, inserimento manuale, modifica quantità/pasto, eliminazione. |
| **Acqua** | Obiettivo personalizzabile, pulsanti rapidi 150/250/500 ml, quantità libera, grafico cumulativo di oggi, ultimi 7 giorni, percentuale, storico. |
| **Attività** | Camminata, corsa, bici, nuoto, palestra, pesi, calcio, basket, yoga, HIIT. Durata, intensità, distanza (dove applicabile), peso corporeo. Calorie = MET × kg × ore (valori MET dal *Compendium of Physical Activities*; per corsa/camminata/bici il MET viene calcolato dalla velocità se inserisci la distanza). |
| **Progressi** | Grafici settimanali/mensili di calorie assunte e bruciate, macro, acqua, allenamenti; andamento del peso con obiettivo. |
| **Profilo** | Onboarding guidato al primo accesso (età, sesso facoltativo, altezza, peso, peso obiettivo, attività, obiettivo). BMR con Mifflin-St Jeor, TDEE, obiettivi calorici e macro personalizzati (anche manualmente). Tema chiaro/scuro/sistema, promemoria acqua e pasti (in-app + notifiche di sistema), logout. |

## Sicurezza e dati

- Tutte le letture e scritture passano da **Server Action** che verificano la sessione nel database e filtrano ogni query per `user_id`: un utente non può leggere né modificare i dati di un altro. Gli input sono validati con Zod e dai vincoli `CHECK` del database.
- Password con hash, sessioni in cookie httpOnly gestite da Better Auth.
- Le chiavi AI e nutrizionali restano **solo sul server**; le API verificano la sessione e hanno un rate limit per utente.
- `proxy.ts` reindirizza al login chi non ha una sessione.

## Avvio in locale

1. Crea un database Postgres (es. gratis su [neon.tech](https://neon.tech)) e copia la connection string.
2. Copia `.env.example` in `.env.local` e compila `DATABASE_URL`, `BETTER_AUTH_SECRET` (`openssl rand -hex 32`) e `ANTHROPIC_API_KEY`.
3. Crea le tabelle e avvia:

```bash
npm install
npm run db:migrate
npm run dev
```

## Deploy su Vercel

1. Importa il repository su Vercel con **Root Directory** `fittrack-ai`.
2. Nel progetto: **Storage → Create Database → Neon** (piano gratuito) e collegalo: imposta `DATABASE_URL` da solo.
3. Aggiungi le variabili `BETTER_AUTH_SECRET` e `ANTHROPIC_API_KEY` (e facoltativamente `FDC_API_KEY`).
4. Ridistribuisci. A ogni build `npm run build` applica lo schema (`db/schema.sql`, idempotente) prima di compilare.

## Struttura

```
src/
  app/(app)/          pagine autenticate: home, diario, scansiona, acqua, attivita, progressi, profilo
  app/(auth)/         login e registrazione
  app/onboarding/     procedura guidata del primo accesso
  app/api/auth        endpoint di Better Auth
  app/api/ai/analyze-food   analisi foto con Claude (server)
  app/api/foods/search      ricerca alimenti: CREA locale + Open Food Facts + USDA (server)
  components/app/     componenti dell'app (anello calorie, grafici, ricerca alimenti, …)
  components/ui/      componenti shadcn/ui
  lib/server/         database, autenticazione e Server Action (accesso ai dati)
  lib/                calcoli (nutrizione, MET), utilità
db/schema.sql         schema del database
scripts/migrate.mjs   applica lo schema (npm run db:migrate)
```

> Le stime di calorie, metabolismo e porzioni sono indicative e non sostituiscono il parere di un medico o di un nutrizionista.
