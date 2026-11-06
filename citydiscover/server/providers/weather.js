'use strict';
// Meteo da Open-Meteo (gratuito, senza chiave). Fornisce anche il fuso orario della città.
const config = require('../config');
const { request, cached } = require('../http');

const WMO = {
  0: ['Sereno', '☀️'], 1: ['Prevalentemente sereno', '🌤️'], 2: ['Parzialmente nuvoloso', '⛅'], 3: ['Coperto', '☁️'],
  45: ['Nebbia', '🌫️'], 48: ['Nebbia con brina', '🌫️'], 51: ['Pioviggine leggera', '🌦️'], 53: ['Pioviggine', '🌦️'],
  55: ['Pioviggine intensa', '🌧️'], 61: ['Pioggia debole', '🌦️'], 63: ['Pioggia', '🌧️'], 65: ['Pioggia forte', '🌧️'],
  66: ['Pioggia gelata', '🌧️'], 67: ['Pioggia gelata forte', '🌧️'], 71: ['Neve debole', '🌨️'], 73: ['Neve', '🌨️'],
  75: ['Neve forte', '❄️'], 77: ['Granelli di neve', '🌨️'], 80: ['Rovesci', '🌦️'], 81: ['Rovesci', '🌧️'],
  82: ['Rovesci violenti', '⛈️'], 85: ['Rovesci di neve', '🌨️'], 86: ['Rovesci di neve', '❄️'], 95: ['Temporale', '⛈️'],
  96: ['Temporale con grandine', '⛈️'], 99: ['Temporale con grandine', '⛈️'],
};
const describe = (code) => WMO[code] || ['n.d.', '🌡️'];
const isWet = (code) => code >= 51;

async function forecast(lat, lon) {
  const url =
    `${config.endpoints.openMeteo}?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=7` +
    `&current=temperature_2m,weather_code,wind_speed_10m,precipitation` +
    `&hourly=temperature_2m,precipitation_probability,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset`;
  const key = `wx:${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;
  const r = await cached(key, config.ttl.weather, () => request(url, { source: 'Open-Meteo' }));
  const w = r.value;
  return {
    timezone: w.timezone,
    utcOffsetSeconds: w.utc_offset_seconds,
    current: w.current && {
      temperature: w.current.temperature_2m,
      code: w.current.weather_code,
      text: describe(w.current.weather_code)[0],
      icon: describe(w.current.weather_code)[1],
      wind: w.current.wind_speed_10m,
    },
    daily: (w.daily?.time || []).map((d, i) => ({
      date: d,
      code: w.daily.weather_code[i],
      text: describe(w.daily.weather_code[i])[0],
      icon: describe(w.daily.weather_code[i])[1],
      max: w.daily.temperature_2m_max[i],
      min: w.daily.temperature_2m_min[i],
      rainProbability: w.daily.precipitation_probability_max[i],
      sunrise: w.daily.sunrise[i],
      sunset: w.daily.sunset[i],
    })),
    hourly: (w.hourly?.time || []).map((t, i) => ({
      time: t,
      temperature: w.hourly.temperature_2m[i],
      rainProbability: w.hourly.precipitation_probability[i],
      code: w.hourly.weather_code[i],
    })),
    fetchedAt: r.fetchedAt,
    stale: r.stale,
    source: 'Open-Meteo',
  };
}

module.exports = { forecast, isWet, describe };
