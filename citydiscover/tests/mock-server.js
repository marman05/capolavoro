'use strict';
// SOLO PER SVILUPPO/TEST DELL'INTERFACCIA SENZA RETE: avvia il server con le API esterne simulate
// (dati di prova di Firenze, vedi fixtures.js). In produzione usare `npm start`.
process.env.CD_DB_FILE = process.env.CD_DB_FILE || ':memory:';
process.env.TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY || 'mock';
process.env.CD_REFRESH_MINUTES = '0';
require('./fixtures').install();
console.warn('⚠️  Modalità MOCK: i dati mostrati sono fittizi e servono solo a provare l\'interfaccia.');
require('../server/server').start(Number(process.env.PORT || 8080));
