import { planFor } from "@/lib/plan";

export const dynamic = "force-dynamic";

const hits = new Map<string, number[]>();

function limited(req: Request) {
  if (process.env.DISABLE_RATE_LIMIT === "1") return false;
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}

export async function POST(req: Request) {
  if (limited(req)) return Response.json({ error: "Too many questions. Try again in a minute." }, { status: 429 });
  let dish = "";
  try {
    const body = await req.json();
    dish = typeof body?.dish === "string" ? body.dish : "";
  } catch {
    return Response.json({ error: "Send the dish as JSON." }, { status: 400 });
  }
  if (!dish.trim()) return Response.json({ error: "Tell me what's in the cooker." }, { status: 400 });
  if (dish.length > 120) return Response.json({ error: "Keep it short: just the dish." }, { status: 400 });
  try {
    return Response.json(await planFor(dish));
  } catch (err) {
    console.error("plan:", (err as Error).message);
    return Response.json({ plan: null, why: "Couldn't ask the model just now. Set the number of whistles yourself." });
  }
}
