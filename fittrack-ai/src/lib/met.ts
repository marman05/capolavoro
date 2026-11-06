import type { Intensity } from "./types";

/**
 * Valori MET dal "2024 Adult Compendium of Physical Activities" (Herrmann et al.).
 * kcal = MET × peso (kg) × durata (ore)
 */
export interface ActivityDef {
  id: string;
  label: string;
  emoji: string;
  supportsDistance: boolean;
  met: Record<Intensity, number>;
  /** Tabella [velocità km/h minima, MET] usata quando l'utente inserisce la distanza. */
  speedTable?: [number, number][];
}

export const ACTIVITIES: ActivityDef[] = [
  {
    id: "walking",
    label: "Camminata",
    emoji: "🚶",
    supportsDistance: true,
    met: { light: 2.8, moderate: 3.5, vigorous: 5.0 },
    speedTable: [
      [0, 2.0],
      [3.2, 2.8],
      [4.0, 3.0],
      [4.8, 3.5],
      [5.6, 4.3],
      [6.4, 5.0],
      [7.2, 7.0],
    ],
  },
  {
    id: "running",
    label: "Corsa",
    emoji: "🏃",
    supportsDistance: true,
    met: { light: 7.0, moderate: 9.8, vigorous: 11.8 },
    speedTable: [
      [0, 6.0],
      [8.0, 8.3],
      [9.7, 9.8],
      [10.8, 10.5],
      [11.3, 11.0],
      [12.9, 11.8],
      [14.5, 12.8],
      [16.1, 14.5],
      [17.7, 16.0],
    ],
  },
  {
    id: "cycling",
    label: "Bicicletta",
    emoji: "🚴",
    supportsDistance: true,
    met: { light: 4.0, moderate: 6.8, vigorous: 10.0 },
    speedTable: [
      [0, 4.0],
      [16.1, 6.8],
      [19.3, 8.0],
      [22.5, 10.0],
      [25.7, 12.0],
      [30.6, 15.8],
    ],
  },
  {
    id: "swimming",
    label: "Nuoto",
    emoji: "🏊",
    supportsDistance: true,
    met: { light: 5.8, moderate: 8.3, vigorous: 9.8 },
  },
  { id: "gym", label: "Palestra", emoji: "🏋️", supportsDistance: false, met: { light: 3.5, moderate: 5.0, vigorous: 7.0 } },
  {
    id: "weights",
    label: "Allenamento con pesi",
    emoji: "💪",
    supportsDistance: false,
    met: { light: 3.5, moderate: 5.0, vigorous: 6.0 },
  },
  { id: "soccer", label: "Calcio", emoji: "⚽", supportsDistance: false, met: { light: 7.0, moderate: 8.0, vigorous: 10.0 } },
  { id: "basketball", label: "Basket", emoji: "🏀", supportsDistance: false, met: { light: 4.5, moderate: 6.5, vigorous: 8.0 } },
  { id: "yoga", label: "Yoga", emoji: "🧘", supportsDistance: false, met: { light: 2.3, moderate: 3.0, vigorous: 4.0 } },
  { id: "hiit", label: "Allenamento HIIT", emoji: "🔥", supportsDistance: false, met: { light: 6.0, moderate: 8.0, vigorous: 10.0 } },
];

export const INTENSITIES: { id: Intensity; label: string }[] = [
  { id: "light", label: "Leggera" },
  { id: "moderate", label: "Moderata" },
  { id: "vigorous", label: "Intensa" },
];

export function getActivity(id: string) {
  return ACTIVITIES.find((a) => a.id === id);
}

/** Interpola linearmente la tabella velocità→MET. */
function metFromSpeed(table: [number, number][], kmh: number) {
  if (kmh <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [s1, m1] = table[i];
    const [s0, m0] = table[i - 1];
    if (kmh <= s1) return m0 + ((m1 - m0) * (kmh - s0)) / (s1 - s0);
  }
  return table[table.length - 1][1];
}

export function computeMET(activityId: string, intensity: Intensity, durationMin: number, distanceKm?: number | null) {
  const a = getActivity(activityId);
  if (!a) return 0;
  if (a.speedTable && distanceKm && distanceKm > 0 && durationMin > 0) {
    const kmh = distanceKm / (durationMin / 60);
    return Math.round(metFromSpeed(a.speedTable, kmh) * 10) / 10;
  }
  return a.met[intensity];
}

export function caloriesBurned(met: number, weightKg: number, durationMin: number) {
  return Math.round(met * weightKg * (durationMin / 60));
}
