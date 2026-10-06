import { config } from "./config";
import { logger } from "./logger";

const API_VERSION = "2024-10-21";

/**
 * Embeddings from an Azure OpenAI deployment. Returns null when AI is not configured,
 * so search falls back to full text.
 */
export async function embed(texts: string[]): Promise<number[][] | null> {
  const ai = config.openai;
  if (!ai || texts.length === 0) return null;
  const started = performance.now();
  const res = await fetch(`${ai.endpoint}/openai/deployments/${ai.embeddingDeployment}/embeddings?api-version=${API_VERSION}`, {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": ai.apiKey },
    body: JSON.stringify({ input: texts }),
  });
  if (!res.ok) {
    logger.warn({ event: "ai.embed_failed", status: res.status, body: (await res.text()).slice(0, 300) });
    throw new Error(`Embedding request failed with ${res.status}`);
  }
  const body = (await res.json()) as { data: Array<{ index: number; embedding: number[] }>; usage?: { total_tokens?: number } };
  logger.debug({ event: "ai.embed", count: texts.length, tokens: body.usage?.total_tokens, ms: Math.round(performance.now() - started) });
  return body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

const queryCache = new Map<string, number[]>();

export async function embedQuery(text: string): Promise<number[] | null> {
  const key = text.trim().toLowerCase();
  if (!key || !config.openai) return null;
  const hit = queryCache.get(key);
  if (hit) return hit;
  try {
    const [v] = (await embed([key])) ?? [];
    if (!v) return null;
    if (queryCache.size > 500) queryCache.delete(queryCache.keys().next().value!);
    queryCache.set(key, v);
    return v;
  } catch {
    return null; // search continues with full text
  }
}
