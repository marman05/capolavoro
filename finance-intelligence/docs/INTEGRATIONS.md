# Integrazioni: cosa è realmente disponibile

Verifica effettuata a novembre 2026, prima dell'implementazione. Le condizioni dei provider cambiano: ricontrollare le fonti prima di andare in produzione.

## Riepilogo

| Fonte | Canale | Stato | Cosa copre | Implementazione |
|---|---|---|---|---|
| Revolut (personale, piano Metal) | API ufficiale per clienti privati | ❌ Non esiste (solo Revolut Business / Merchant API) | — | — |
| Revolut | Open Banking PSD2 – AIS tramite provider autorizzato | ✅ | Conti, saldi, movimenti (sola lettura) | `server/enablebanking.ts`, `src/connectors/openbanking.ts` |
| Revolut | Estratto conto CSV / Excel / PDF dall'app | ✅ | Movimenti, saldo per conto/valuta | `src/connectors/revolut.ts` |
| Revolut | Dettagli piano, vantaggi, assicurazioni | ❌ Nessuna API | — | Verifica manuale guidata (`src/analytics/metal.ts`) |
| Trade Republic | API pubblica per clienti privati | ❌ Non esiste | — | — |
| Trade Republic | API non ufficiali (es. `pytr`) | ⚠️ Esistono ma richiedono numero di telefono + PIN | — | **Non usate**: violerebbero il requisito "mai credenziali nell'app" |
| Trade Republic | Interfaccia PSD2 per TPP (TPP API Guide) | ⚠️ Solo per AISP/PISP licenziati, solo conto di liquidità | Saldo e movimenti del conto di liquidità, non il deposito titoli | Utilizzabile automaticamente se compare nell'elenco banche di Enable Banking |
| Trade Republic | Esportazione transazioni (CSV) dall'app | ✅ (rilasciata nel 2026) | Movimenti di conto e titoli (quantità, prezzi, commissioni) | `src/connectors/traderepublic.ts` (riconoscimento colonne multilingua) |
| Trade Republic | Estratti PDF (deposito titoli) | ✅ | Posizioni e controvalori a una data | Parser euristico con anteprima obbligatoria |
| Tassi di cambio | BCE (via frankfurter.app) | ✅ Gratuito, senza chiave | Tassi di riferimento giornalieri | `server/index.ts` → `/api/fx/latest` |

## Perché Enable Banking

- È un prestatore di servizi di informazione sui conti autorizzato e supporta Revolut (unica voce ASPSP con `psu_type` personal/business).
- Offre un accesso gratuito per uso personale (collegare i propri conti), adatto a questa app self-hosted. Verificare i limiti attuali (frequenza di polling) sul sito del provider.
- GoCardless Bank Account Data (ex Nordigen), storicamente l'alternativa gratuita, **non accetta nuove registrazioni self-service da luglio 2025**.
- Alternative commerciali compatibili con l'architettura (stessa interfaccia `SourceConnector`): Tink, TrueLayer, Salt Edge, Yapily.

### Configurazione Enable Banking

1. Crea un account sul control panel di Enable Banking e registra un'applicazione (ambiente produzione, uso "restricted"/personale).
2. Genera la coppia di chiavi: carica la chiave pubblica, salva la privata come `enablebanking.pem` (mai nel repository: è in `.gitignore`).
3. Imposta come redirect URL `http://localhost:5173/connessioni/callback` (o l'URL pubblico della tua istanza).
4. Collega i tuoi conti Revolut all'applicazione quando richiesto dal provider (modalità di accesso limitato).
5. Compila `.env` (`ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY_PATH`, `ENABLE_BANKING_REDIRECT_URL`, `SERVER_ENCRYPTION_KEY`).
6. In app: Connessioni → paese **LT** (Revolut Bank UAB è registrata in Lituania) o IT → "Collega".

Flusso: `POST /auth` → l'utente si autentica **solo** su Revolut (SCA) → redirect con `code` + `state` (verificato contro CSRF) → `POST /sessions` → lettura `/accounts/{uid}/balances` e `/accounts/{uid}/transactions` con paginazione `continuation_key` → `DELETE /sessions/{id}` alla disconnessione.

Limiti PSD2 da conoscere:
- il consenso dura al massimo 180 giorni, poi va rinnovato (l'app avvisa 14 giorni prima);
- gli accessi senza l'utente presente sono limitati (tipicamente 4 al giorno): la sincronizzazione automatica avviene all'apertura dell'app se sono passate più di 6 ore;
- alcune banche restituiscono lo storico completo solo nei primi minuti dopo il consenso.

## Fonti

- Trade Republic, TPP API Guide v2: https://assets.traderepublic.com/assets/files/TPP_API_Guide_v2.pdf
- Open Banking Tracker – Trade Republic APIs: https://openbankingtracker.com/provider/trade-republic/apis
- Open Banking Tracker – Revolut via Enable Banking: https://openbankingtracker.com/enablebanking/revolut
- Actual Budget – stato GoCardless Bank Account Data: https://actualbudget.org/docs/advanced/bank-sync/gocardless/
- Portfolio Performance forum – export transazioni Trade Republic: https://forum.portfolio-performance.info/t/import-trade-republic-csv-transaktionsexport/39126
- Blockpit – import CSV Trade Republic: https://intercom.help/blockpit/en/articles/15452549-how-to-import-data-via-trade-republic-csv-file

## Aggiungere una nuova fonte

1. Implementa `SourceConnector` (`src/connectors/types.ts`): `detectTabular`/`parseTabular` per file tabellari, `detectText`/`parseText` per PDF, normalizzando nel modello canonico (`src/domain/types.ts`).
2. Registralo in `CONNECTORS` (`src/connectors/registry.ts`). Rilevamento formato, anteprima, deduplicazione e riconciliazione dei trasferimenti tra conti sono automatici.
3. Per un aggregatore Open Banking diverso, aggiungi un router in `server/` con gli stessi endpoint (`/auth`, `/session`, `/sync`, `DELETE /session/:id`) e una funzione di normalizzazione come `normalizeSync`.
