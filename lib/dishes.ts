// How many whistles? The usual answers for everyday dishes, so the common case needs no model and
// no internet. Anything else (or "rajma, but I forgot to soak it") goes to an open LLM, and whatever
// it says is checked against the same limits before it's used.

export type Plan = {
  dish: string;
  whistles: number;
  /** minutes on a low flame after the last whistle, 0 for none */
  simmer: number;
  note: string;
  source: "table" | "model" | "you";
};

type Row = { dish: string; names: string[]; whistles: number; simmer?: number; note?: string };

export const DISHES: Row[] = [
  { dish: "Toor dal", names: ["toor", "tuvar", "arhar", "dal", "daal", "dal tadka", "dal fry", "sambar dal"], whistles: 3, note: "Washed and soaked for half an hour." },
  { dish: "Moong dal", names: ["moong", "mung", "moong dal", "yellow dal"], whistles: 2 },
  { dish: "Masoor dal", names: ["masoor", "red lentils", "lal masoor"], whistles: 2 },
  { dish: "Chana dal", names: ["chana dal", "chane ki dal"], whistles: 4 },
  { dish: "Rajma", names: ["rajma", "rajmah", "kidney beans"], whistles: 6, simmer: 10, note: "Soaked overnight. Not soaked? Ask for that." },
  { dish: "Chole", names: ["chole", "chhole", "kabuli chana", "chickpeas", "chana masala", "chhole"], whistles: 5, simmer: 10, note: "Soaked overnight." },
  { dish: "Kala chana", names: ["kala chana", "black chana", "black chickpeas"], whistles: 5, note: "Soaked overnight." },
  { dish: "Dal makhani", names: ["dal makhani", "makhani", "sabut urad", "whole urad", "maa ki dal"], whistles: 8, simmer: 20, note: "Soaked overnight." },
  { dish: "Lobia", names: ["lobia", "lobhia", "black eyed peas", "chawli"], whistles: 4, note: "Soaked for a few hours." },
  { dish: "Rice", names: ["rice", "chawal", "plain rice", "steamed rice"], whistles: 2, note: "Then let the steam settle on its own." },
  { dish: "Khichdi", names: ["khichdi", "khichri", "khichadi"], whistles: 3 },
  { dish: "Veg pulao", names: ["pulao", "pulav", "veg pulao"], whistles: 1, note: "Then let the steam settle on its own." },
  { dish: "Aloo", names: ["aloo", "alu", "potato", "potatoes", "boiled potatoes"], whistles: 3 },
  { dish: "Shakarkandi", names: ["shakarkandi", "sweet potato", "sweet potatoes"], whistles: 2 },
  { dish: "Arbi", names: ["arbi", "taro", "colocasia"], whistles: 2 },
  { dish: "Beetroot", names: ["beetroot", "chukandar", "beet"], whistles: 3 },
  { dish: "Sweet corn", names: ["corn", "sweet corn", "bhutta", "makka"], whistles: 3 },
  { dish: "Chicken curry", names: ["chicken", "chicken curry", "murgh"], whistles: 2 },
  { dish: "Mutton curry", names: ["mutton", "mutton curry", "gosht", "goat"], whistles: 6, simmer: 10 },
];

export const QUICK = ["Toor dal", "Rajma", "Chole", "Rice", "Aloo", "Khichdi"];

const clean = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The table's answer for what the cook typed, or null when it isn't simply a dish name. */
export function lookup(input: string): Plan | null {
  const q = clean(input);
  if (!q) return null;
  let best: { row: Row; len: number } | null = null;
  for (const row of DISHES) {
    for (const name of [row.dish, ...row.names]) {
      const n = clean(name);
      // the whole input is the dish, or the dish plus a word like "make" or "ki"
      if (q === n || q === `${n} ki` || q === `${n} ka`) {
        if (!best || n.length > best.len) best = { row, len: n.length };
      }
    }
  }
  if (!best) return null;
  return { dish: best.row.dish, whistles: best.row.whistles, simmer: best.row.simmer ?? 0, note: best.row.note ?? "", source: "table" };
}

/** Anything from a model (or a hand-edited form) is held to these limits before it's used. */
export function checkPlan(raw: unknown, fallbackDish: string): Plan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const whistles = Math.round(Number(r.whistles));
  const simmer = Math.round(Number(r.simmer ?? 0));
  if (!Number.isFinite(whistles) || whistles < 1 || whistles > 12) return null;
  const named = typeof r.dish === "string" && r.dish.trim() ? r.dish.trim().slice(0, 60) : fallbackDish.trim().slice(0, 60);
  const dish = named.charAt(0).toUpperCase() + named.slice(1);
  const note = typeof r.note === "string" ? r.note.replace(/\s+/g, " ").trim().slice(0, 160) : "";
  return {
    dish,
    whistles,
    simmer: Number.isFinite(simmer) ? Math.min(Math.max(simmer, 0), 45) : 0,
    note,
    source: "model",
  };
}
