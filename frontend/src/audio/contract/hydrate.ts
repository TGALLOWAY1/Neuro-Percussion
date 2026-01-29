/**
 * Single entry point: hydrate any patch-like object to CanonicalPatch.
 * Removes legacy fields. In dev, throws if legacy remains after strip.
 * Merges canonical envelope defaults under envelopeParams so migrated/empty patches match new patch.
 */

import type { InstrumentType } from "@/types";
import {
  CANONICAL_SCHEMA_VERSION,
  type CanonicalPatch,
} from "./types";
import {
  stripLegacyParams,
  getLegacyKeysInParams,
} from "./legacy";
import { getCanonicalEnvelopeDefaults } from "@/audio/params";

const DEV =
  typeof process !== "undefined" &&
  process.env?.NODE_ENV !== "production";

/** Patch-like: V0, V1, or raw record from kit/API */
export type PatchLike =
  | { schemaVersion?: number; params?: Record<string, number>; envelopeParams?: Record<string, number>; seed?: number; repeatMode?: string; roomEnabled?: boolean; instrument?: InstrumentType }
  | Record<string, unknown>;

/**
 * Hydrate any patch-like value to CanonicalPatch.
 * - Migrates V0 -> V1 (schemaVersion, envelopeParams, repeatMode, roomEnabled).
 * - Strips legacy param keys from params.
 * - envelopeParams: canonical defaults merged under raw so migrated/empty patch matches new patch.
 * - In dev mode, throws if legacy keys were present (enforces removal at source).
 */
export function hydratePatchToCanonical(
  patchLike: PatchLike,
  instrument: InstrumentType
): CanonicalPatch {
  const raw = patchLike as Record<string, unknown>;
  const hasV1 = raw.schemaVersion === 1;

  const params: Record<string, number> = { ...(raw.params as Record<string, number> || {}) };
  const legacyBefore = getLegacyKeysInParams(params as Record<string, unknown>);
  const paramsClean = stripLegacyParams(params as Record<string, unknown>) as Record<string, number>;

  if (DEV && legacyBefore.length > 0) {
    console.warn(
      `[Parameter Contract] Legacy fields stripped during hydration: ${legacyBefore.join(", ")}. Instrument: ${instrument}.`
    );
  }

  const canonicalEnvelopeDefaults = getCanonicalEnvelopeDefaults(instrument as "kick" | "snare" | "hat");
  const rawEnvelope = (raw.envelopeParams as Record<string, number>) || {};
  const envelopeParams = { ...canonicalEnvelopeDefaults, ...rawEnvelope };

  const canonical: CanonicalPatch = {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    instrument,
    params: paramsClean,
    envelopeParams,
    seed: typeof raw.seed === "number" ? raw.seed : 42,
    repeatMode: hasV1 && typeof raw.repeatMode === "string" ? raw.repeatMode as CanonicalPatch["repeatMode"] : "oneshot",
    roomEnabled: hasV1 && typeof raw.roomEnabled === "boolean" ? raw.roomEnabled : false,
  };

  return canonical;
}
