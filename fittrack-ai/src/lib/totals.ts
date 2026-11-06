import type { FoodEntry, MealType, WaterLog, Workout } from "./types";
import { sumBy } from "./nutrition";

export function foodTotals(foods: FoodEntry[]) {
  return {
    calories: sumBy(foods, (f) => f.calories),
    protein: sumBy(foods, (f) => f.protein_g),
    carbs: sumBy(foods, (f) => f.carbs_g),
    fat: sumBy(foods, (f) => f.fat_g),
  };
}

export function mealTotals(foods: FoodEntry[], meal: MealType) {
  return foodTotals(foods.filter((f) => f.meal_type === meal));
}

export function waterTotal(water: WaterLog[]) {
  return sumBy(water, (w) => w.amount_ml);
}

export function workoutTotals(workouts: Workout[]) {
  return {
    burned: sumBy(workouts, (w) => w.calories_burned),
    minutes: sumBy(workouts, (w) => w.duration_min),
    count: workouts.length,
  };
}
