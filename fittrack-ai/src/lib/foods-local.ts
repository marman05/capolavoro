import type { FoodSearchResult } from "./types";

/**
 * Piccola base dati di alimenti generici comuni (valori per 100 g di parte edibile,
 * fonte: tabelle CREA / USDA FoodData Central). Garantisce risultati immediati
 * anche quando le API nutrizionali esterne non rispondono.
 * [nome, kcal, proteine, carboidrati, grassi, porzione tipica g]
 */
const RAW: [string, number, number, number, number, number?][] = [
  ["Pasta di semola, cotta", 158, 5.8, 30.9, 0.9, 200],
  ["Pasta di semola, cruda", 353, 12.5, 72.2, 1.5, 80],
  ["Pasta integrale, cotta", 149, 6.0, 28.0, 1.3, 200],
  ["Riso bianco, cotto", 130, 2.7, 28.2, 0.3, 180],
  ["Riso basmati, crudo", 352, 7.5, 78.0, 0.6, 80],
  ["Pane comune", 271, 8.6, 56.4, 1.6, 50],
  ["Pane integrale", 247, 10.0, 46.0, 3.4, 50],
  ["Fette biscottate", 410, 11.3, 73.0, 7.0, 10],
  ["Fiocchi d'avena", 379, 13.2, 67.7, 6.5, 40],
  ["Cornflakes", 357, 7.5, 84.0, 0.4, 30],
  ["Pizza margherita", 266, 11.0, 33.0, 10.0, 300],
  ["Patate lesse", 86, 1.7, 20.0, 0.1, 200],
  ["Patatine fritte", 312, 3.4, 41.0, 15.0, 120],
  ["Petto di pollo, cotto", 165, 31.0, 0, 3.6, 150],
  ["Petto di tacchino, cotto", 135, 30.0, 0, 1.0, 150],
  ["Manzo magro, cotto", 217, 26.0, 0, 12.0, 150],
  ["Carne macinata di manzo (10% grassi), cotta", 217, 26.1, 0, 11.8, 120],
  ["Maiale, lonza cotta", 196, 29.0, 0, 8.0, 150],
  ["Prosciutto crudo", 268, 25.5, 0, 18.5, 50],
  ["Prosciutto cotto", 132, 19.8, 0.9, 5.4, 50],
  ["Bresaola", 151, 32.0, 0.4, 2.6, 50],
  ["Salmone, cotto", 206, 22.0, 0, 13.0, 150],
  ["Tonno al naturale, sgocciolato", 103, 25.0, 0, 0.5, 80],
  ["Tonno sott'olio, sgocciolato", 192, 25.2, 0, 10.1, 80],
  ["Merluzzo, cotto", 105, 23.0, 0, 0.9, 150],
  ["Gamberi, cotti", 99, 24.0, 0.2, 0.3, 100],
  ["Uovo intero", 143, 12.6, 0.7, 9.5, 60],
  ["Albume d'uovo", 52, 10.9, 0.7, 0.2, 33],
  ["Latte parzialmente scremato", 46, 3.3, 4.9, 1.5, 200],
  ["Latte intero", 64, 3.3, 4.9, 3.6, 200],
  ["Yogurt greco 0%", 59, 10.3, 3.6, 0.4, 170],
  ["Yogurt bianco intero", 61, 3.5, 4.7, 3.3, 125],
  ["Mozzarella", 253, 18.7, 0.7, 19.5, 125],
  ["Parmigiano Reggiano", 392, 33.0, 0, 28.0, 10],
  ["Grana Padano", 398, 33.0, 0, 28.5, 10],
  ["Pecorino romano", 387, 32.0, 0.2, 28.0, 10],
  ["Pesto alla genovese", 448, 5.0, 5.0, 45.0, 30],
  ["Sugo di pomodoro", 50, 1.5, 7.0, 2.0, 80],
  ["Ricotta vaccina", 146, 8.8, 3.5, 10.9, 100],
  ["Formaggio fresco spalmabile", 253, 6.0, 4.0, 24.0, 30],
  ["Burro", 717, 0.9, 0.1, 81.0, 10],
  ["Olio extravergine d'oliva", 884, 0, 0, 100, 10],
  ["Mela", 52, 0.3, 13.8, 0.2, 180],
  ["Banana", 89, 1.1, 22.8, 0.3, 120],
  ["Arancia", 47, 0.9, 11.8, 0.1, 150],
  ["Pera", 57, 0.4, 15.2, 0.1, 170],
  ["Fragole", 32, 0.7, 7.7, 0.3, 150],
  ["Uva", 69, 0.7, 18.1, 0.2, 150],
  ["Kiwi", 61, 1.1, 14.7, 0.5, 75],
  ["Mirtilli", 57, 0.7, 14.5, 0.3, 100],
  ["Avocado", 160, 2.0, 8.5, 14.7, 100],
  ["Pomodoro", 18, 0.9, 3.9, 0.2, 150],
  ["Insalata verde", 15, 1.4, 2.9, 0.2, 80],
  ["Zucchine, cotte", 17, 1.2, 3.1, 0.3, 200],
  ["Broccoli, cotti", 35, 2.4, 7.2, 0.4, 200],
  ["Carote", 41, 0.9, 9.6, 0.2, 100],
  ["Spinaci, cotti", 23, 3.0, 3.8, 0.3, 200],
  ["Peperoni", 26, 1.0, 6.0, 0.3, 150],
  ["Melanzane, grigliate", 35, 0.8, 8.7, 0.2, 150],
  ["Legumi: ceci, cotti", 164, 8.9, 27.4, 2.6, 150],
  ["Legumi: lenticchie, cotte", 116, 9.0, 20.1, 0.4, 150],
  ["Legumi: fagioli borlotti, cotti", 127, 8.7, 22.8, 0.5, 150],
  ["Mandorle", 579, 21.2, 21.6, 49.9, 30],
  ["Noci", 654, 15.2, 13.7, 65.2, 30],
  ["Burro d'arachidi", 588, 25.0, 20.0, 50.0, 20],
  ["Cioccolato fondente 70%", 598, 7.8, 45.9, 42.6, 20],
  ["Biscotti frollini", 470, 6.5, 70.0, 18.0, 30],
  ["Cornetto / brioche", 406, 8.0, 46.0, 21.0, 60],
  ["Miele", 304, 0.3, 82.4, 0, 15],
  ["Marmellata", 250, 0.4, 62.0, 0.1, 20],
  ["Zucchero", 387, 0, 100, 0, 5],
  ["Gelato alla crema", 207, 3.5, 24.0, 11.0, 100],
  ["Tiramisù", 283, 5.0, 30.0, 16.0, 120],
  ["Hamburger (panino completo)", 254, 13.0, 26.0, 11.0, 220],
  ["Lasagne alla bolognese", 166, 9.0, 15.0, 8.0, 300],
  ["Risotto ai funghi", 140, 3.5, 22.0, 4.0, 300],
  ["Sushi (nigiri al salmone)", 160, 7.0, 25.0, 3.5, 150],
  ["Piadina", 320, 8.0, 50.0, 10.0, 110],
  ["Caffè espresso (senza zucchero)", 2, 0.1, 0.3, 0, 30],
  ["Cappuccino", 41, 2.3, 3.6, 2.0, 180],
  ["Succo d'arancia", 45, 0.7, 10.4, 0.2, 200],
  ["Coca-Cola", 42, 0, 10.6, 0, 330],
  ["Birra chiara", 43, 0.5, 3.6, 0, 330],
  ["Vino rosso", 85, 0.1, 2.6, 0, 125],
  ["Proteine whey in polvere", 400, 80.0, 8.0, 6.0, 30],
];

function slug(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-");
}

export const LOCAL_FOODS: FoodSearchResult[] = RAW.map(([name, calories, protein, carbs, fat, serving]) => ({
  id: `local-${slug(name)}`,
  name,
  source: "local",
  per100: { calories, protein, carbs, fat },
  servingGrams: serving,
}));

export function searchLocalFoods(q: string, limit = 8): FoodSearchResult[] {
  const terms = slug(q).split("-").filter(Boolean);
  if (!terms.length) return [];
  return LOCAL_FOODS.map((f) => {
    const s = slug(f.name);
    let score = 0;
    for (const t of terms) {
      if (s.startsWith(t)) score += 3;
      else if (s.includes(`-${t}`)) score += 2;
      else if (s.includes(t)) score += 1;
      else return { f, score: -1 };
    }
    return { f, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.f);
}
