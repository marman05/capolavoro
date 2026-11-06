interface DayState {
  eaten: number;
  goal: number;
  burned: number;
  waterMl: number;
  waterGoal: number;
  workouts: number;
  protein: number;
  proteinGoal: number;
  hour: number;
}

/** Messaggio motivazionale contestuale, calcolato dai dati reali della giornata. */
export function motivationalMessage(s: DayState): { emoji: string; text: string } {
  const remaining = s.goal - s.eaten + s.burned;
  const waterPct = s.waterGoal ? s.waterMl / s.waterGoal : 0;

  if (s.eaten === 0 && s.hour < 11) return { emoji: "🌅", text: "Buongiorno! Inizia la giornata registrando la colazione." };
  if (s.eaten === 0) return { emoji: "📸", text: "Non hai ancora registrato pasti oggi: scatta una foto al prossimo piatto." };
  if (remaining < -200) return { emoji: "🧭", text: "Hai superato l'obiettivo di oggi: una camminata può aiutarti a bilanciare." };
  if (waterPct < 0.4 && s.hour >= 14) return { emoji: "💧", text: "Sei indietro con l'acqua: un bicchiere adesso fa la differenza." };
  if (s.workouts > 0 && waterPct >= 1) return { emoji: "🏆", text: "Allenamento fatto e idratazione al top. Giornata perfetta!" };
  if (s.workouts > 0) return { emoji: "🔥", text: `Ottimo lavoro! Hai bruciato ${Math.round(s.burned)} kcal con l'attività di oggi.` };
  if (s.proteinGoal && s.protein / s.proteinGoal < 0.5 && s.hour >= 15)
    return { emoji: "🥚", text: "Punta su una fonte di proteine al prossimo pasto per raggiungere l'obiettivo." };
  if (remaining >= 0 && remaining < 150) return { emoji: "🎯", text: "Sei praticamente sul tuo obiettivo calorico. Ben fatto!" };
  if (waterPct >= 1) return { emoji: "✨", text: "Obiettivo acqua raggiunto! Continua così." };
  return { emoji: "💪", text: "Ogni registrazione conta: sei sulla strada giusta." };
}
