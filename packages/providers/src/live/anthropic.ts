// Shared Anthropic Messages API client bits (thin fetch, matching the other
// live providers) used by the call scorer and the daily-summary generator.

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
const ANTHROPIC_VERSION = "2023-06-01";

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export function anthropicConfigFromEnv(): AnthropicConfig | null {
  const { ANTHROPIC_API_KEY, ANTHROPIC_MODEL, ANTHROPIC_BASE_URL } = process.env;
  if (!ANTHROPIC_API_KEY) return null;
  return {
    apiKey: ANTHROPIC_API_KEY,
    model: ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
    baseUrl: (ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, ""),
  };
}

export class AnthropicApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AnthropicApiError";
  }
}

export type FetchLike = typeof fetch;

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface MessagesResponse {
  content?: { type?: string; text?: string }[];
  model?: string;
}

/** One Messages API call; returns the concatenated text blocks + raw body. */
export async function completeMessages(
  config: AnthropicConfig,
  fetchImpl: FetchLike,
  req: { system: string; messages: AnthropicMessage[]; maxTokens: number },
): Promise<{ text: string; raw: unknown }> {
  const res = await fetchImpl(`${config.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: req.maxTokens,
      temperature: 0,
      system: req.system,
      messages: req.messages,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable body>");
    throw new AnthropicApiError(res.status, `Anthropic request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as MessagesResponse;
  const text = (json.content ?? [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("");
  return { text, raw: json };
}
