// Deepgram transcription provider.
//
// A thin typed client over the pre-recorded audio endpoint (no SDK — one POST
// with the audio bytes, keyed by a static API key, keeps the surface
// unit-testable with an injected fetch). Diarization is requested so the
// transcript reads as a speaker-labeled dialog, which the scoring prompt
// understands better than a wall of text; when utterances are missing the
// plain channel transcript is the fallback. Env: DEEPGRAM_API_KEY
// (+ optional DEEPGRAM_MODEL, default nova-3).

import type { TranscriptionProvider } from "../types";

export interface DeepgramConfig {
  apiKey: string;
  model: string;
}

export const DEFAULT_DEEPGRAM_MODEL = "nova-3";

export function deepgramConfigFromEnv(): DeepgramConfig | null {
  const { DEEPGRAM_API_KEY, DEEPGRAM_MODEL } = process.env;
  if (!DEEPGRAM_API_KEY) return null;
  return { apiKey: DEEPGRAM_API_KEY, model: DEEPGRAM_MODEL || DEFAULT_DEEPGRAM_MODEL };
}

export class DeepgramApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DeepgramApiError";
  }
}

type FetchLike = typeof fetch;

const LISTEN_URL = "https://api.deepgram.com/v1/listen";

interface DeepgramUtterance {
  speaker?: number;
  transcript?: string;
}

interface DeepgramResponse {
  results?: {
    utterances?: DeepgramUtterance[];
    channels?: { alternatives?: { transcript?: string }[] }[];
  };
}

/** Speaker-labeled dialog from diarized utterances (exported for tests). */
export function formatUtterances(utterances: DeepgramUtterance[]): string {
  return utterances
    .filter((u) => u.transcript)
    .map((u) => `Speaker ${(u.speaker ?? 0) + 1}: ${u.transcript}`)
    .join("\n");
}

export class DeepgramTranscriptionProvider implements TranscriptionProvider {
  constructor(
    private readonly config: DeepgramConfig | null = deepgramConfigFromEnv(),
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async transcribe(audio: { bytes: Uint8Array; contentType: string }): Promise<{ text: string }> {
    if (!this.config) {
      throw new Error("Deepgram is not configured — set DEEPGRAM_API_KEY (or run with DATA_MODE=demo).");
    }
    const params = new URLSearchParams({
      model: this.config.model,
      smart_format: "true",
      diarize: "true",
      utterances: "true",
    });
    const res = await this.fetchImpl(`${LISTEN_URL}?${params}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${this.config.apiKey}`,
        "Content-Type": audio.contentType,
      },
      // Cast: the DOM lib's BodyInit wants Uint8Array<ArrayBuffer>, but our
      // audio bytes are typed against ArrayBufferLike.
      body: audio.bytes as Uint8Array<ArrayBuffer>,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable body>");
      throw new DeepgramApiError(res.status, `Deepgram transcription failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as DeepgramResponse;
    const utterances = json.results?.utterances ?? [];
    const text = utterances.length
      ? formatUtterances(utterances)
      : (json.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "");
    return { text };
  }
}
