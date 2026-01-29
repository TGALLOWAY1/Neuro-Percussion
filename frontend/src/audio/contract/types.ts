/**
 * Parameter contract: canonical schema and engine payload types.
 * Only CanonicalPatch is used in the UI/store; only EngineParams reaches the API/instruments.
 */

import type { InstrumentType } from "@/types";

/** Latest schema version for patches */
export const CANONICAL_SCHEMA_VERSION = 1 as const;

/**
 * Canonical patch — the single authoritative schema for the app.
 * No legacy fields. Used everywhere after hydration.
 */
export interface CanonicalPatch {
  schemaVersion: typeof CANONICAL_SCHEMA_VERSION;
  instrument: InstrumentType;
  /** Macro params only (no legacy keys like delayMix, roomMix, etc.) */
  params: Record<string, number>;
  /** Envelope UI params (from EnvelopeStrip) */
  envelopeParams: Record<string, number>;
  seed: number;
  repeatMode?: "oneshot" | "roll" | "echo";
  roomEnabled?: boolean;
}

/**
 * Engine params — the only object allowed to reach instrument DSP.
 * Produced only by mapCanonicalToEngineParams. Never raw patch objects.
 */
export interface EngineParams {
  seed: number;
  /** Top-level and nested keys expected by backend resolve_params + engines */
  [key: string]: unknown;
}

/**
 * Legacy/deprecated keys that must not appear in canonical params or engine params.
 * In dev, presence of these after hydration causes an error.
 */
export const LEGACY_PARAM_KEYS = [
  "delayMix",
  "delayFeedback",
  "roomMix",
  "earlyReflections",
  "predelay",
] as const;

export type LegacyParamKey = (typeof LEGACY_PARAM_KEYS)[number];
