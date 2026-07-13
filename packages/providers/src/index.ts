// Provider factory: DATA_MODE selects mock (demo) or live implementations.
// This is the only place the selection happens.

import type { CallProvider, CallScorer, CrmProvider, SummaryGenerator, TranscriptionProvider, DataMode } from "./types";
import {
  MockCallProvider,
  MockCallScorer,
  MockCrmProvider,
  MockSummaryGenerator,
  MockTranscriptionProvider,
} from "./mock/providers";
import { RingCentralProvider } from "./live/ringcentral";
import { AgencyZoomProvider } from "./live/agencyzoom";
import { DeepgramTranscriptionProvider } from "./live/deepgram";
import { AnthropicCallScorer } from "./live/anthropic-scorer";
import { AnthropicSummaryGenerator } from "./live/anthropic-summary";

export * from "./types";
// Error classes and constants consumers (the worker) need for typed handling.
export { RingCentralApiError } from "./live/ringcentral";
export { AgencyZoomApiError } from "./live/agencyzoom";
export { DeepgramApiError } from "./live/deepgram";
export { AnthropicApiError } from "./live/anthropic";
export { CALL_SCORING_PROMPT_VERSION } from "./live/anthropic-scorer";

export function getDataMode(): DataMode {
  return process.env.DATA_MODE === "live" ? "live" : "demo";
}

export function isDemoMode(): boolean {
  return getDataMode() === "demo";
}

export function getCallProvider(): CallProvider {
  return isDemoMode() ? new MockCallProvider() : new RingCentralProvider();
}

export function getCrmProvider(): CrmProvider {
  return isDemoMode() ? new MockCrmProvider() : new AgencyZoomProvider();
}

export function getTranscriptionProvider(): TranscriptionProvider {
  return isDemoMode() ? new MockTranscriptionProvider() : new DeepgramTranscriptionProvider();
}

export function getCallScorer(): CallScorer {
  return isDemoMode() ? new MockCallScorer() : new AnthropicCallScorer();
}

export function getSummaryGenerator(): SummaryGenerator {
  return isDemoMode() ? new MockSummaryGenerator() : new AnthropicSummaryGenerator();
}
