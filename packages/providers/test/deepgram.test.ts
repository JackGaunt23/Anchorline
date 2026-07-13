import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEEPGRAM_MODEL,
  DeepgramApiError,
  DeepgramTranscriptionProvider,
  formatUtterances,
  type DeepgramConfig,
} from "../src/live/deepgram";

type Handler = (url: string, init?: RequestInit) => Response;

function fakeFetch(handler: Handler) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const cfg: DeepgramConfig = { apiKey: "dg-key", model: DEFAULT_DEEPGRAM_MODEL };
const audio = { bytes: new TextEncoder().encode("fake-audio"), contentType: "audio/mpeg" };

describe("DeepgramTranscriptionProvider", () => {
  it("POSTs the audio with token auth, content type, and diarization params", async () => {
    const { impl, calls } = fakeFetch(() =>
      json({ results: { channels: [{ alternatives: [{ transcript: "hello there" }] }] } }),
    );
    const provider = new DeepgramTranscriptionProvider(cfg, impl);
    const { text } = await provider.transcribe(audio);

    expect(text).toBe("hello there");
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(url.origin + url.pathname).toBe("https://api.deepgram.com/v1/listen");
    expect(url.searchParams.get("model")).toBe(DEFAULT_DEEPGRAM_MODEL);
    expect(url.searchParams.get("diarize")).toBe("true");
    expect(url.searchParams.get("utterances")).toBe("true");
    expect(url.searchParams.get("smart_format")).toBe("true");
    const init = calls[0]!.init!;
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Token dg-key");
    expect(headers["Content-Type"]).toBe("audio/mpeg");
    expect(init.body).toBe(audio.bytes);
  });

  it("prefers speaker-labeled utterances over the flat transcript", async () => {
    const { impl } = fakeFetch(() =>
      json({
        results: {
          utterances: [
            { speaker: 0, transcript: "Anchorline Insurance, this is Priya." },
            { speaker: 1, transcript: "Hi, I need an auto quote." },
            { speaker: 0, transcript: "Happy to help." },
          ],
          channels: [{ alternatives: [{ transcript: "flattened text" }] }],
        },
      }),
    );
    const provider = new DeepgramTranscriptionProvider(cfg, impl);
    const { text } = await provider.transcribe(audio);
    expect(text).toBe(
      [
        "Speaker 1: Anchorline Insurance, this is Priya.",
        "Speaker 2: Hi, I need an auto quote.",
        "Speaker 1: Happy to help.",
      ].join("\n"),
    );
  });

  it("uses a configured model override", async () => {
    const { impl, calls } = fakeFetch(() => json({ results: {} }));
    const provider = new DeepgramTranscriptionProvider({ apiKey: "k", model: "nova-2-phonecall" }, impl);
    await provider.transcribe(audio);
    expect(new URL(calls[0]!.url).searchParams.get("model")).toBe("nova-2-phonecall");
  });

  it("returns empty text when the response has no transcript", async () => {
    const { impl } = fakeFetch(() => json({ results: { channels: [] } }));
    const provider = new DeepgramTranscriptionProvider(cfg, impl);
    expect((await provider.transcribe(audio)).text).toBe("");
  });

  it("throws DeepgramApiError with the status on a failed request", async () => {
    const { impl } = fakeFetch(() => new Response("bad key", { status: 401 }));
    const provider = new DeepgramTranscriptionProvider(cfg, impl);
    await expect(provider.transcribe(audio)).rejects.toMatchObject({
      name: "DeepgramApiError",
      status: 401,
    });
    await expect(provider.transcribe(audio)).rejects.toBeInstanceOf(DeepgramApiError);
  });

  it("explains missing configuration", async () => {
    const provider = new DeepgramTranscriptionProvider(null);
    await expect(provider.transcribe(audio)).rejects.toThrow(/DEEPGRAM_API_KEY/);
  });
});

describe("formatUtterances", () => {
  it("labels speakers 1-based and skips empty utterances", () => {
    expect(
      formatUtterances([
        { speaker: 0, transcript: "one" },
        { speaker: 1, transcript: "" },
        { speaker: 2, transcript: "three" },
        { transcript: "no speaker" },
      ]),
    ).toBe("Speaker 1: one\nSpeaker 3: three\nSpeaker 1: no speaker");
  });
});
