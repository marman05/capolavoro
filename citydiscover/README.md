# CityDiscover

Guida intelligente a **qualsiasi città del mondo**: luoghi da visitare, eventi, ristoranti e locali, posti nascosti, mappa interattiva con distanze e tempi, voti 1–10 da recensioni reali e itinerari della giornata ottimizzati.

Funziona come **sito web** e come **app mobile** (PWA installabile su Android/iOS; impacchettabile come app nativa con Capacitor).

## Avvio rapido

Requisiti: **Node.js ≥ 22.5**. Non ci sono dipendenze npm: database (SQLite integrato in Node), server HTTP e client sono scritti senza librerie esterne (Leaflet per la mappa è incluso in `public/vendor`).

```bash
cd citydiscover
cp .env.example .env    # facoltativo: inserisci le chiavi eventi
npm start               # http://localhost:8080
```

Le variabili d'ambiente vanno esportate (o passate con `node --env-file=.env server/server.js`).

```bash
npm test                # 16 test: unitari + integrazione delle API
npm run demo:mock       # interfaccia con API esterne SIMULATE (solo per sviluppo offline)
```

Con Docker: `docker build -t citydiscover . && docker run -p 8080:8080 -v cd-data:/data citydiscover`.

## Fonti dati (reali, nessun dato inventato)

| Funzione | Fonte | Chiave |
|---|---|---|
| Ricerca città (tutte le lingue e alfabeti) | OpenStreetMap Nominatim | no |
| Luoghi, attrazioni, ristoranti, locali, orari, ingresso, sito | OpenStreetMap Overpass API | no |
| Foto, descrizioni, popolarità (lingue Wikipedia, visitatori/anno) | Wikidata, Wikipedia, Wikimedia Commons | no |
| Distanze e tempi a piedi/in auto, tracciato del percorso | OSRM (routing.openstreetmap.de) | no |
| Meteo e fuso orario della città | Open-Meteo | no |
| Eventi: concerti, sport, teatro, famiglie, prezzi, biglietti | Ticketmaster Discovery API | `TICKETMASTER_API_KEY` |
| Eventi: festival, feste locali, fiere/sagre, community, sport | PredictHQ | `PREDICTHQ_TOKEN` |
| Mappa | tile OpenStreetMap + Leaflet | no |

Per uso intensivo in produzione conviene puntare a istanze proprie o a pagamento (variabili `NOMINATIM_URL`, `OVERPASS_URLS`, `OSRM_FOOT_URL`, `OSRM_CAR_URL`, `OPEN_METEO_URL`) e a un fornitore di tile con contratto: i servizi pubblici OSM hanno limiti d'uso.

### Trasparenza sui dati

- **Voto 1–10**: calcolato *solo* dalle recensioni degli utenti registrati (60% gradimento generale, 25% qualità dell'esperienza, 15% rapporto qualità‑prezzo). Sotto le 3 recensioni (`CD_MIN_REVIEWS`) viene mostrato «Voto n.d.» con il numero di recensioni.
- **Popolarità** e **interesse turistico** sono un indice separato (0–100), basato su dati oggettivi: numero di edizioni Wikipedia, visitatori annui da Wikidata, recensioni e salvataggi. Non è un voto.
- **Orari e prezzi** OSM sono sempre segnati come «non verificati»; i formati di orario non interpretabili risultano «n.d.» invece di essere indovinati.
- **Mezzi pubblici**: non esiste un servizio gratuito mondiale di orari; il tempo è indicato come *stima* e c'è sempre il link alla navigazione con i mezzi (orari reali di Google Maps).
- **Eventi**: senza chiavi API la sezione dichiara che nessuna fonte è attiva. Ogni elenco mostra fonte, stato delle fonti e data dell'ultimo aggiornamento.
- Se una fonte non risponde viene usata l'ultima copia salvata, segnalata come tale.

## Funzionalità

- Home con grande ricerca «Quale città vuoi scoprire?», suggerimenti, posizione attuale, città recenti.
- Pagina città: meteo, **Cosa fare oggi**, **Classifica migliori attrazioni**, **I migliori posti vicino a te**, **Eventi oggi / questo weekend**, **Posti nascosti da scoprire**.
- **Esplora**: lista + mappa sincronizzate; filtri per categoria, distanza (1/5/10/20/50/100 km), voto (6–10), prezzo (gratuito/economico/medio/costoso), aperto ora, posti nascosti, ordinamento (popolari, voto, vicini, meno conosciuti).
- **Mappa** a tutto schermo con livelli (da vedere, natura, attività, cibo, eventi), posizione utente, popup con distanza, scheda e navigazione.
- **Eventi**: oggi, domani, weekend, 7/30 giorni, date personalizzate; categorie (concerti, festival, feste locali, discoteche/serate, sport, mostre, teatro, sagre/mercatini, famiglie); gratuiti/a pagamento; data e orari, indirizzo, distanza, prezzo, disponibilità, link biglietti.
- **Scheda luogo**: foto, descrizione Wikipedia, categoria, voto e sotto‑voti, indirizzo, distanza, tempi a piedi/auto/mezzi, orari settimanali, ingresso, tempo consigliato, sito, telefono, accessibilità, recensioni, indicazioni (Google, Apple, OSM).
- **Organizza la giornata**: data, ora di inizio, ore disponibili, mezzo, ritmo, interessi, pasti, eventi, posti nascosti, solo gratis. L'algoritmo rispetta orari di apertura, durata delle visite, eventi a orario fisso, finestre per pranzo/cena, meteo (con pioggia privilegia luoghi al coperto) e minimizza gli spostamenti (inserimento a costo minimo + 2‑opt). Esportazione in Google Maps e condivisione.
- **Account**: registrazione/accesso (scrypt + token firmati), recensioni, preferiti, liste personalizzate con link di condivisione pubblico.
- Ricerca full‑text veloce (SQLite FTS5) sui luoghi già indicizzati; tema chiaro/scuro; responsive; offline per le pagine già visitate.

## Architettura

```
server/
  server.js        HTTP, routing REST, file statici, aggiornamento periodico
  service.js       logica: combinazione fonti, filtri, sezioni, liste
  itinerary.js     pianificatore della giornata
  ratings.js       voti e popolarità
  auth.js          utenti e token
  opening-hours.js parser orari OSM
  db.js            schema SQLite (utenti, recensioni, liste, luoghi + FTS, cache API)
  http.js          client HTTP: timeout, retry, ritmo per host, cache su DB
  providers/       geocode, places (Overpass), wiki, events, weather, routing
public/            SPA + PWA (manifest, service worker, icone)
tests/             test node:test e fetch simulato
```

**Aggiornamento automatico**: ogni risposta esterna è salvata in `api_cache` con scadenza (eventi 3 h, meteo 1 h, luoghi 7 giorni, Wikipedia 14 giorni). Un job interno (`CD_REFRESH_MINUTES`) riaggiorna eventi, luoghi e meteo delle città cercate di recente.

### API principali

`GET /api/cities/search?q=` · `GET /api/city/highlights?id=` · `GET /api/city/places?id=&category=&radiusKm=&minScore=&price=&openNow=1&hidden=1&sort=` · `GET /api/nearby?lat=&lon=` · `GET /api/place?id=` · `GET /api/events?id=&when=today|tomorrow|weekend|week|month|custom&from=&to=&category=&free=1` · `POST /api/itinerary` · `GET /api/search?q=` · `POST /api/auth/register|login` · `GET|POST|DELETE /api/reviews` · `/api/lists…` · `GET /api/shared/:token`

## App mobile

1. **PWA**: aprendo il sito dal telefono si può «Aggiungere alla schermata Home»; funziona a schermo intero con barra di navigazione inferiore.
2. **App negli store** (Capacitor): pubblica il server su un dominio HTTPS, imposta `server.url` in `capacitor.config.json`, poi:
   ```bash
   npm i -D @capacitor/cli @capacitor/core @capacitor/android @capacitor/ios
   npx cap add android && npx cap add ios
   npx cap open android
   ```

## Licenze dei dati

© OpenStreetMap contributors (ODbL) · testi Wikipedia e foto Commons CC BY‑SA (attribuzione mostrata) · Open-Meteo CC BY 4.0 · Ticketmaster e PredictHQ secondo i rispettivi termini.
