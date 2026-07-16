// Shared OpenAI Chat Completions API client bits (thin fetch, matching the
// other live providers) used by the call scorer and daily-summary generator.

export const DEFAULT_OPENAI_MODEL = "gpt-5.1";

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export function openAIConfigFromEnv(): OpenAIConfig | null {
  const { OPENAI_API_KEY, OPENAI_MODEL, OPENAI_BASE_URL } = process.env;
  if (!OPENAI_API_KEY) return null;
  return {
    apiKey: OPENAI_API_KEY,
    model: OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    baseUrl: (OPENAI_BASE_URL || "https://api.openai.com").replace(/\/+$/, ""),
  };
}

export class OpenAIApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "OpenAIApiError";
  }
}

export type FetchLike = typeof fetch;

export interface OpenAIMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatCompletionsResponse {
  choices?: [{ message?: { content?: string | null } }];
  model?: string;
}

/** One Chat Completions API call; returns the response text + raw body. */
export async function completeChat(
  config: OpenAIConfig,
  fetchImpl: FetchLike,
  req: { system: string; messages: OpenAIMessage[]; maxTokens: number },
): Promise<{ text: string; raw: unknown }> {
  const res = await fetchImpl(`${config.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_completion_tokens: req.maxTokens,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: req.system }, ...req.messages],
      // No temperature field: gpt-5.x rejects the old temperature: 0 determinism nudge.
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable body>");
    throw new OpenAIApiError(res.status, `OpenAI request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as ChatCompletionsResponse;
  const text = json.choices?.[0]?.message?.content ?? "";
  return { text, raw: json };
}
