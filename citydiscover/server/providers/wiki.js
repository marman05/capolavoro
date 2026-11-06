'use strict';
// Foto, descrizioni e indicatori di notorietà da Wikidata / Wikipedia / Wikimedia Commons.
const config = require('../config');
const { request, cached } = require('../http');

const commonsFile = (file, width = 1024) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(String(file).replace(/^File:/i, '').replace(/ /g, '_'))}?width=${width}`;

function claimValue(entity, prop) {
  const c = entity.claims && entity.claims[prop];
  if (!c || !c.length) return null;
  const v = c.find((x) => x.rank === 'preferred') || c[0];
  return v.mainsnak && v.mainsnak.datavalue ? v.mainsnak.datavalue.value : null;
}

/** Aggiunge in-place foto, descrizione e popolarità ai luoghi che hanno un id Wikidata. */
async function enrichFromWikidata(places, lang = 'it') {
  const withQ = places.filter((p) => p.wikidata && /^Q\d+$/.test(p.wikidata));
  const byQ = new Map();
  for (const p of withQ) {
    if (!byQ.has(p.wikidata)) byQ.set(p.wikidata, []);
    byQ.get(p.wikidata).push(p);
  }
  const ids = [...byQ.keys()];
  const langs = [...new Set([lang, 'en'])].join('|');
  const chunks = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  let idx = 0;
  async function worker() {
    while (idx < chunks.length) {
      const chunk = chunks[idx++];
      const url =
        `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims|sitelinks|descriptions` +
        `&languages=${langs}|it&ids=${chunk.join('|')}`;
      const r = await cached(`wd:${lang}:${chunk.join(',')}`, config.ttl.wiki, () => request(url, { source: 'Wikidata' }));
      for (const [q, ent] of Object.entries(r.value.entities || {})) {
        const sitelinks = ent.sitelinks || {};
        const img = claimValue(ent, 'P18');
        const visitors = claimValue(ent, 'P1174');
        const descs = ent.descriptions || {};
        const desc = descs[lang] || descs.en || Object.values(descs)[0] || null;
        // Wikipedia nella lingua scelta, altrimenti inglese, italiano o la prima disponibile.
        const wikiKeys = Object.keys(sitelinks).filter((k) => /^[a-z-]+wiki$/.test(k) && !['commonswiki', 'specieswiki', 'metawiki'].includes(k));
        const wpKey = [`${lang}wiki`, 'enwiki', 'itwiki'].find((k) => sitelinks[k]) || wikiKeys[0];
        const wpLang = wpKey ? wpKey.slice(0, -4).replace(/_/g, '-') : null;
        for (const p of byQ.get(q) || []) {
          p.sitelinks = Object.keys(sitelinks).filter((k) => k.endsWith('wiki')).length;
          if (img && !p.image) p.image = commonsFile(img, 1024);
          if (desc) p.wikiDescription = desc.value;
          if (visitors && visitors.amount) p.visitorsPerYear = Math.round(Number(visitors.amount));
          if (wpLang) p.wikipediaLocal = `${wpLang}:${sitelinks[wpKey].title}`;
          if (!p.website) {
            const site = claimValue(ent, 'P856');
            if (site) p.website = site;
          }
          p.notability += Math.min(10, Math.round(Math.log2(1 + p.sitelinks) * 2));
        }
      }
    }
  }
  await Promise.all([worker(), worker()]);
  return places;
}

/** Estratto Wikipedia e galleria foto per la scheda del luogo. */
async function details(place, lang = 'it') {
  const ref = place.wikipediaLocal || place.wikipedia;
  if (!ref) return null;
  const m = /^([a-z-]+):(.+)$/.exec(ref);
  const wlang = m ? m[1] : config.endpoints.wikipediaLang;
  const title = (m ? m[2] : ref).replace(/ /g, '_');
  const base = `https://${wlang}.wikipedia.org/api/rest_v1/page`;
  const r = await cached(`wp:${wlang}:${title}`, config.ttl.wiki, async () => {
    const [summary, media] = await Promise.all([
      request(`${base}/summary/${encodeURIComponent(title)}`, { source: 'Wikipedia' }),
      request(`${base}/media-list/${encodeURIComponent(title)}`, { source: 'Wikipedia' }).catch(() => ({ items: [] })),
    ]);
    const photos = (media.items || [])
      .filter((i) => i.type === 'image' && i.srcset && i.srcset.length && !/\.svg$/i.test(i.title || ''))
      .slice(0, 12)
      .map((i) => ({
        url: 'https:' + i.srcset[i.srcset.length - 1].src,
        caption: i.caption ? i.caption.text : null,
        credit: 'Wikimedia Commons',
      }));
    return {
      extract: summary.extract || null,
      title: summary.title,
      url: summary.content_urls ? summary.content_urls.desktop.page : null,
      image: summary.originalimage ? summary.originalimage.source : summary.thumbnail ? summary.thumbnail.source : null,
      photos,
      lang: wlang,
    };
  });
  return { ...r.value, fetchedAt: r.fetchedAt };
}

module.exports = { enrichFromWikidata, details, commonsFile };
