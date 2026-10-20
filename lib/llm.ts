// Talks to any OpenAI-compatible chat API: Groq by default, Ollama or vLLM with LLM_BASE_URL.
const GROQ = "https://api.groq.com/openai/v1";

export class LLMError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function parseJSON(text: string): unknown {
  const cleaned = String(text)
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/```(?:json)?/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export function hasModel() {
  return Boolean(process.env.GROQ_API_KEY || process.env.LLM_BASE_URL) && process.env.MOCK_MODEL !== "1";
}

type ChatOptions = { model: string; system: string; user: string; temperature?: number; maxTokens?: number; attempts?: number };

export async function chatJSON({ model, system, user, temperature = 0.2, maxTokens = 800, attempts = 3 }: ChatOptions): Promise<unknown> {
  const base = process.env.LLM_BASE_URL || GROQ;
  const key = process.env.GROQ_API_KEY || process.env.LLM_API_KEY || "";
  let jsonMode = true;
  let lastError: Error = new LLMError("no attempts made");

  for (let attempt = 0; attempt < attempts; attempt++) {
    const body: Record<string, unknown> = {
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };
    if (jsonMode) body.response_format = { type: "json_object" };
    if (/gpt-oss/i.test(model)) body.reasoning_effort = "low";

    let res: Response;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      lastError = new LLMError(`${model}: ${(err as Error).message}`);
      await sleep(800 * (attempt + 1));
      continue;
    }

    if (res.ok) {
      const data = await res.json();
      try {
        return parseJSON(data.choices?.[0]?.message?.content ?? "");
      } catch {
        lastError = new LLMError(`${model} didn't reply with JSON`);
        continue;
      }
    }
    const detail = await res.text();
    if (res.status === 400 && jsonMode && /json|response_format/i.test(detail)) {
      jsonMode = false;
      lastError = new LLMError(`${model}: ${detail.slice(0, 200)}`, 400);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      lastError = new LLMError(`${model}: ${res.status}`, res.status);
      const wait = Number(res.headers.get("retry-after")) * 1000;
      if (attempt < attempts - 1) await sleep(Math.min(wait || 1500 * 2 ** attempt, 8000));
      continue;
    }
    throw new LLMError(`${model}: ${res.status} ${detail.slice(0, 200)}`, res.status);
  }
  throw lastError;
}
