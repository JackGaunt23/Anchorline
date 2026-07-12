// Deepgram transcription provider — implemented in Phase 4.

import type { TranscriptionProvider } from "../types";

export class DeepgramTranscriptionProvider implements TranscriptionProvider {
  async transcribe(_audio: { bytes: Uint8Array; contentType: string }): Promise<{ text: string }> {
    throw new Error("DeepgramTranscriptionProvider is implemented in Phase 4. Run with DATA_MODE=demo.");
  }
}
