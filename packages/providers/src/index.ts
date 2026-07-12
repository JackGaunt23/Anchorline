// Provider factory: DATA_MODE selects mock (demo) or live implementations.
// This is the only place the selection happens.

import type { CallProvider, CrmProvider, TranscriptionProvider, DataMode } from "./types";
import { MockCallProvider, MockCrmProvider, MockTranscriptionProvider } from "./mock/providers";
import { RingCentralProvider } from "./live/ringcentral";
import { AgencyZoomProvider } from "./live/agencyzoom";
import { DeepgramTranscriptionProvider } from "./live/deepgram";

export * from "./types";

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
