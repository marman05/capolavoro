# Finance Intelligence — Revolut Metal × Trade Republic

Personal Finance Intelligence Center in **sola lettura**: centralizza i dati di Revolut (piano Metal) e Trade Republic, li analizza e li trasforma in grafici, risposte e suggerimenti concreti, distinguendo sempre i **fatti** dalle **stime**.

> Nessuna password bancaria, PIN o OTP viene mai richiesto o memorizzato. L'app non può eseguire bonifici, pagamenti o ordini.

## Funzionalità

| Sezione | Contenuto |
|---|---|
| **Dashboard** | Patrimonio netto, liquidità, investimenti, performance mensile, entrate/uscite del mese, evoluzione del patrimonio, distribuzione del denaro, ultime transazioni, principali spese, rendimento investimenti, Metal Utilization Score, le 3 migliori opportunità. Widget nascondibili e riordinabili. |
| **Patrimonio** | Totale, liquidità, saldi Revolut e Trade Republic, investimenti per classe, interessi, dividendi, plus/minus realizzate e non, entrate/uscite mensili, grafico giornaliero/settimanale/mensile/annuale con intervallo personalizzato. Nessun doppio conteggio (trasferimenti tra conti propri riconciliati automaticamente). |
| **Spese** | Categorizzazione automatica (10 categorie, correggibile e "appresa" per esercente), grafico mensile, confronto tra mesi, categorie più costose, spese ricorrenti, abbonamenti potenzialmente dimenticati (con indizi oggettivi), spese insolite (statistica robusta), abitudini, scenari di risparmio con ipotesi esplicite. |
| **Revolut Metal** | Catalogo vantaggi con verifica per paese/piano (nessun vantaggio dato per scontato), utilizzo rilevato dai movimenti, valore ottenuto e potenziale, **Metal Utilization Score**. |
| **Investimenti** | Valore, capitale investito, P/L, rendimento totale, posizioni, dividendi, interessi, PAC, commissioni, TER, esposizione geografica e settoriale, diversificazione e concentrazioni, confronto con benchmark a parità di versamenti. |
| **Assistente AI** | Motore locale deterministico (nessun dato esce dal dispositivo) per le 12 domande chiave + modalità Claude (opzionale, con consenso) che riceve solo un riepilogo aggregato. Ogni risposta indica il periodo e separa fatti e stime. |
| **Opportunità per te** | Abbonamenti da verificare, commissioni evitabili, vantaggi Metal non sfruttati, cambio valuta nel weekend, liquidità ferma, ricorrenti eccessive, concentrazioni, TER, funzionalità non usate. Ogni suggerimento: cosa, perché, quanto, come, rischi. Ordinati per impatto. |
| **Previsioni e obiettivi** | Risparmio annuo previsto, proiezione del patrimonio con 4 scenari di rendimento e inflazione, fondo emergenza, spese ricorrenti future, obiettivi collegati a liquidità/investimenti/patrimonio con data stimata. |
| **Notifiche** | Spese anomale, nuovi abbonamenti, aumenti di prezzo, commissioni, variazioni del portafoglio, dividendi, rinnovi, consensi in scadenza, vantaggi non sfruttati, obiettivi raggiunti (anche come notifiche browser, opt‑in). |
| **Connessioni** | Stato verificato delle integrazioni, Open Banking PSD2 (Enable Banking), import CSV/Excel/PDF con riconoscimento automatico e anteprima, gestione e revoca dei consensi. |
| **Privacy** | Consensi, valuta e tassi BCE, parametri di analisi, blocco automatico, esportazione JSON/CSV, cancellazione totale. |

Quali API esistono davvero e perché sono state scelte: **[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)**.

## Avvio

Requisiti: Node.js 20+.

```bash
cd finance-intelligence
npm install
cp .env.example .env      # opzionale: Open Banking e assistente AI
npm run dev               # frontend su http://localhost:5173, API su 127.0.0.1:8787
```

Al primo avvio crei una passphrase che cifra i dati sul dispositivo. Poi puoi importare gli estratti conto, collegare Revolut via Open Banking oppure esplorare l'app con **dati di esempio** (sempre etichettati come tali).

Produzione: `npm run build && npm start` (Express serve anche il frontend compilato, con CSP restrittiva).

Test: `npm test` (analisi, parser Revolut/Trade Republic, deduplicazione, riconciliazione trasferimenti).

### Variabili d'ambiente (`.env`)

| Variabile | Uso |
|---|---|
| `SERVER_ENCRYPTION_KEY` | 32 byte base64 per cifrare a riposo le sessioni Open Banking |
| `APP_ACCESS_TOKEN` | Token bearer opzionale per proteggere l'API locale |
| `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY_PATH`, `ENABLE_BANKING_REDIRECT_URL` | Open Banking PSD2 |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Assistente AI (default `claude-opus-5-5`) |

## Architettura

```
src/
  domain/        modello dati canonico, categorie, valute, composizioni ETF indicative
  connectors/    un connettore per fonte (Revolut, Trade Republic, posizioni generiche),
                 lettori CSV/Excel/PDF, client Open Banking, riconciliazione e merge
  analytics/     motore di analisi puro e testabile: patrimonio, spese, ricorrenze,
                 anomalie, portafoglio, Metal, opportunità, previsioni, notifiche, assistente
  storage/       cassaforte cifrata (AES-256-GCM + PBKDF2) su IndexedDB
  state/         store React, blocco automatico, istantanee del patrimonio
  pages/, components/   interfaccia (React + Tailwind + Recharts)
server/
  enablebanking.ts  PSD2 AIS: JWT RS256, consenso, sync, revoca (sessioni cifrate a riposo)
  ai.ts             proxy streaming verso la Claude API (chiave solo lato server)
  index.ts          Express, Helmet/CSP, rate limit, token opzionale, tassi BCE
```

Principi:
- **Dati reali, mai simulati**: nessuna connessione finta; i dati di esempio sono un'opzione esplicita.
- **Fatti vs stime**: ogni importo stimato è etichettato e accompagnato dalle ipotesi.
- **Modularità**: una nuova banca/broker = un `SourceConnector` registrato (vedi docs).
- **Privacy by design**: elaborazione locale; al server arrivano solo le chiamate Open Banking e, con consenso, il riepilogo aggregato per l'AI.

Le analisi non costituiscono consulenza finanziaria.
