import { DISHES, type Plan, checkPlan, lookup } from "./dishes.ts";
import { chatJSON, hasModel } from "./llm.ts";

export const PLAN_MODEL = process.env.PLAN_MODEL || "openai/gpt-oss-20b";

const SYSTEM = `You help someone in an Indian kitchen decide how many pressure cooker whistles (seeti) a dish needs, for a typical 3 to 5 litre stovetop cooker with a weighted whistle, on a medium flame.

They may write in English, Hindi or Hinglish, and may add details (not soaked, half kilo, for a baby, in a small cooker). Use them.

For reference, the usual counts:
${DISHES.map((d) => `- ${d.dish}: ${d.whistles}${d.simmer ? `, then ${d.simmer} min on low` : ""}${d.note ? ` (${d.note})` : ""}`).join("\n")}

Reply with JSON only:
{"dish": "short dish name in English", "whistles": 1-12, "simmer": minutes on low after the last whistle (0 if none), "note": "one short practical sentence, or empty"}

Answer for exactly what they have. If they say it isn't soaked ("bina bhigoye", "not soaked", "forgot to soak"), give the count for unsoaked and say in the note that soaking next time saves gas. Don't ask questions back.
Most dals, legumes, rice dishes, vegetables (kathal, lauki, arbi, chana, palak for saag...), meat and eggs are commonly pressure-cooked in Indian homes. Only for things nobody cooks in a pressure cooker (pizza, salad, tea, bread) reply {"dish": "...", "whistles": 0, "note": "why, in a few words"}.`;

export type PlanResult = { plan: Plan | null; why?: string };

export async function planFor(input: string): Promise<PlanResult> {
  const text = input.replace(/\s+/g, " ").trim().slice(0, 120);
  const known = lookup(text);
  if (known) return { plan: known };
  if (!hasModel()) return { plan: null, why: "I don't know that one without the AI model. Set the number of whistles yourself." };

  const raw = await chatJSON({ model: PLAN_MODEL, system: SYSTEM, user: text });
  const plan = checkPlan(raw, text);
  if (plan) return { plan };
  const note = raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).note === "string" ? String((raw as Record<string, unknown>).note) : "";
  return { plan: null, why: note || "That doesn't sound like a pressure cooker dish. Set the number of whistles yourself." };
}
