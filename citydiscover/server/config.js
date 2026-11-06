'use strict';
// Configurazione centralizzata: tutto è sovrascrivibile da variabili d'ambiente.
const path = require('node:path');

const env = process.env;

module.exports = {
  port: Number(env.PORT || 8080),
  dbFile: env.CD_DB_FILE || path.join(__dirname, '..', 'data', 'citydiscover.db'),
  publicDir: path.join(__dirname, '..', 'public'),
  // Identificazione verso le API pubbliche (richiesto dalle policy OSM/Wikimedia).
  userAgent: env.CD_USER_AGENT || 'CityDiscover/1.0 (+https://github.com/marman05/capolavoro)',
  contactEmail: env.CD_CONTACT_EMAIL || '',

  endpoints: {
    nominatim: env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org',
    overpass: (env.OVERPASS_URLS || 'https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter').split(','),
    osrmFoot: env.OSRM_FOOT_URL || 'https://routing.openstreetmap.de/routed-foot',
    osrmCar: env.OSRM_CAR_URL || 'https://routing.openstreetmap.de/routed-car',
    openMeteo: env.OPEN_METEO_URL || 'https://api.open-meteo.com/v1/forecast',
    wikipediaLang: env.WIKI_DEFAULT_LANG || 'it',
    ticketmaster: 'https://app.ticketmaster.com/discovery/v2/events.json',
    predicthq: 'https://api.predicthq.com/v1/events/',
  },

  keys: {
    ticketmaster: env.TICKETMASTER_API_KEY || '',
    predicthq: env.PREDICTHQ_TOKEN || '',
  },

  // Durata della cache (secondi): i dati vengono riscaricati automaticamente alla scadenza.
  ttl: {
    geocode: 30 * 24 * 3600,
    places: 7 * 24 * 3600,
    wiki: 14 * 24 * 3600,
    events: 3 * 3600,
    weather: 3600,
    route: 24 * 3600,
  },

  // Aggiornamento automatico in background delle città cercate di recente.
  refreshIntervalMinutes: Number(env.CD_REFRESH_MINUTES || 60),
  refreshRecentCities: Number(env.CD_REFRESH_CITIES || 20),

  // Numero minimo di recensioni per mostrare un voto.
  minReviewsForScore: Number(env.CD_MIN_REVIEWS || 3),

  authSecret: env.CD_AUTH_SECRET || '',
};
