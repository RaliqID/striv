export type Unit = "kg" | "lbs";

export function getUserUnit(): Unit {
  if (typeof window === "undefined") return "kg";
  try {
    const stored = localStorage.getItem("user");
    if (stored) {
      const user = JSON.parse(stored);
      const pref = user?.profile?.preferences?.unit;
      if (pref === "lbs" || pref === "kg") return pref;
    }
  } catch {}
  return "kg";
}

export function convertWeight(kg: number, toUnit: Unit): number {
  if (toUnit === "lbs") return kg * 2.20462;
  return kg;
}

export function formatWeight(kg: number, unit: Unit): string {
  const val = convertWeight(kg, unit);
  if (val >= 1000) return (val / 1000).toFixed(1) + "k";
  if (Number.isInteger(val)) return val.toString();
  return val.toFixed(1);
}

export function formatWeightFull(kg: number, unit: Unit): string {
  const val = convertWeight(kg, unit);
  const rounded = Math.round(val * 10) / 10;
  return `${rounded} ${unit}`;
}

export function convertToKg(value: number, fromUnit: Unit): number {
  if (fromUnit === "lbs") return value / 2.20462;
  return value;
}