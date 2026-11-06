'use strict';
// Classificazione dei luoghi a partire dai tag OpenStreetMap.

const CATEGORIES = {
  monument: { label: 'Monumenti', icon: '🏛️', visitMin: 30, indoor: false, group: 'sights' },
  museum: { label: 'Musei e gallerie', icon: '🖼️', visitMin: 90, indoor: true, group: 'sights' },
  church: { label: 'Chiese e luoghi di culto', icon: '⛪', visitMin: 25, indoor: true, group: 'sights' },
  square: { label: 'Piazze', icon: '⛲', visitMin: 20, indoor: false, group: 'sights' },
  attraction: { label: 'Attrazioni', icon: '⭐', visitMin: 45, indoor: false, group: 'sights' },
  viewpoint: { label: 'Panorami', icon: '🌄', visitMin: 20, indoor: false, group: 'nature' },
  park: { label: 'Parchi e giardini', icon: '🌳', visitMin: 45, indoor: false, group: 'nature' },
  beach: { label: 'Spiagge', icon: '🏖️', visitMin: 120, indoor: false, group: 'nature' },
  nature: { label: 'Luoghi naturali', icon: '⛰️', visitMin: 60, indoor: false, group: 'nature' },
  culture: { label: 'Teatri e cultura', icon: '🎭', visitMin: 120, indoor: true, group: 'activities' },
  activity: { label: 'Attività e svago', icon: '🎡', visitMin: 90, indoor: false, group: 'activities' },
  market: { label: 'Mercati', icon: '🧺', visitMin: 40, indoor: false, group: 'activities' },
  restaurant: { label: 'Ristoranti', icon: '🍝', visitMin: 75, indoor: true, group: 'food' },
  cafe: { label: 'Bar e caffè', icon: '☕', visitMin: 30, indoor: true, group: 'food' },
  bar: { label: 'Pub e locali', icon: '🍸', visitMin: 60, indoor: true, group: 'food' },
  nightlife: { label: 'Discoteche', icon: '🪩', visitMin: 150, indoor: true, group: 'food' },
};

function classify(t) {
  const a = t.amenity;
  const tour = t.tourism;
  const hist = t.historic;
  if (a === 'nightclub') return ['nightlife', 'nightclub'];
  if (a === 'restaurant' || a === 'fast_food') return ['restaurant', t.cuisine || a];
  if (a === 'cafe' || a === 'ice_cream') return ['cafe', a];
  if (a === 'bar' || a === 'pub' || a === 'biergarten') return ['bar', a];
  if (a === 'marketplace') return ['market', 'marketplace'];
  if (a === 'theatre' || a === 'arts_centre' || a === 'cinema' || a === 'concert_hall') return ['culture', a];
  if (tour === 'museum' || tour === 'gallery') return ['museum', tour];
  if (a === 'place_of_worship' || hist === 'church' || hist === 'monastery' || t.building === 'cathedral' || t.building === 'basilica' || t.building === 'church')
    return ['church', t.religion || 'place_of_worship'];
  if (tour === 'viewpoint') return ['viewpoint', 'viewpoint'];
  if (t.place === 'square') return ['square', 'square'];
  if (t.natural === 'beach' || t.leisure === 'beach_resort') return ['beach', 'beach'];
  if (t.natural) return ['nature', t.natural];
  if (t.leisure === 'nature_reserve' || t.boundary === 'national_park') return ['nature', 'nature_reserve'];
  if (t.leisure === 'park' || t.leisure === 'garden') return ['park', t.leisure];
  if (tour === 'zoo' || tour === 'aquarium' || tour === 'theme_park' || t.leisure === 'water_park' || t.leisure === 'stadium')
    return ['activity', tour || t.leisure];
  if (hist) return ['monument', hist];
  if (tour === 'artwork') return ['monument', 'artwork'];
  if (tour === 'attraction') return ['attraction', 'attraction'];
  return null;
}

module.exports = { CATEGORIES, classify };
