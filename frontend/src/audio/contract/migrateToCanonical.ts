/**
 * Single path: StoredPatch -> migrateToCanonical -> CanonicalPatch -> mapToEngineParams.
 * No other code path merges parameters. All patch normalization happens here.
 */

import type { InstrumentType } from "@/types";
import { CANONICAL_SCHEMA_VERSION, type CanonicalPatch } from "./types";
import { stripLegacyParams, getLegacyKeysInParams, assertNoLegacyParams } from "./legacy";
import { getAllowedMacroKeys } from "./allowedKeys";
import { migratePatchToV1 } from "../patch/migration";
import { getCanonicalEnvelopeDefaults, getAllowedEnvelopeParamIds } from "@/audio/params";

const DEV =
  typeof process !== "undefined" &&
  process.env?.NODE_ENV !== "production";

/** Patch-like: V0, V1, or raw record from kit/API */
export type PatchLike =
  | {
      schemaVersion?: number;
      params?: Record<string, number>;
      envelopeParams?: Record<string, number>;
      seed?: number;
      repeatMode?: string;
      roomEnabled?: boolean;
      instrument?: InstrumentType;
    }
  | Record<string, unknown>;

/**
 * Deprecated param -> replacement (canonical param or envelope key).
 * If a legacy key is present, we set the replacement then drop the legacy key.
 * Empty = just drop legacy (no replacement).
 */
const DEPRECATED_REPLACEMENTS: Record<string, string> = {
  // Example: delayMix -> could map to snare.fx.delay.mix; for now we just drop
};

/**
 * Single entry point: migrate any patch-like value to CanonicalPatch.
 * - Schema migration (V0 -> V1)
 * - Strip legacy param keys
 * - Strip unknown keys (only allowed macro + envelope keys)
 * - Apply defaults from ParamSpec (envelope defaults)
 * - Deprecated: map to replacements if specified, otherwise drop
 * - Dev: assert no legacy keys in output (throws if any)
 */
export function migrateToCanonical(
  patchLike: PatchLike,
  instrument: InstrumentType
): CanonicalPatch {
  const v1 = migratePatchToV1(patchLike as Parameters<typeof migratePatchToV1>[0]);
  const raw = v1 as unknown as Record<string, unknown>;

  // --- params (macro): strip legacy, apply deprecated replacements, strip unknown ---
  let paramsRaw: Record<string, number> = { ...(raw.params as Record<string, number> || {}) };
  const legacyInParams = getLegacyKeysInParams(paramsRaw as Record<string, unknown>);
  if (DEV && legacyInParams.length > 0) {
    console.warn(
      `[Parameter Contract] Legacy params stripped during migration: ${legacyInParams.join(", ")}. Instrument: ${instrument}.`
    );
  }
  for (const legacyKey of legacyInParams) {
    const replacement = DEPRECATED_REPLACEMENTS[legacyKey];
    if (replacement) {
      const val = paramsRaw[legacyKey as keyof typeof paramsRaw];
      if (val !== undefined) {
        if (replacement.includes(".")) {
          // Envelope key (e.g. snare.body.tone_decay_ms -> we'd set envelopeParams)
          // For now we don't map legacy to envelope in this layer; keep simple
        } else {
          (paramsRaw as Record<string, number>)[replacement] = val;
        }
      }
    }
  }
  const paramsStrippedLegacy = stripLegacyParams(paramsRaw as Record<string, unknown>) as Record<string, number>;
  const allowedMacro = getAllowedMacroKeys(instrument);
  const params: Record<string, number> = {};
  for (const key of Object.keys(paramsStrippedLegacy)) {
    if (allowedMacro.has(key)) params[key] = paramsStrippedLegacy[key];
  }

  // --- envelopeParams: strip unknown, apply defaults ---
  const envelopeDefaults = getCanonicalEnvelopeDefaults(instrument as "kick" | "snare" | "hat");
  const allowedEnvelope = getAllowedEnvelopeParamIds(instrument as "kick" | "snare" | "hat");
  const rawEnvelope = (raw.envelopeParams as Record<string, number>) || {};
  const envelopeFiltered: Record<string, number> = {};
  for (const key of Object.keys(rawEnvelope)) {
    if (allowedEnvelope.has(key)) envelopeFiltered[key] = rawEnvelope[key];
  }
  const envelopeParams = { ...envelopeDefaults, ...envelopeFiltered };

  const canonical: CanonicalPatch = {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    instrument,
    params,
    envelopeParams,
    seed: typeof raw.seed === "number" ? raw.seed : 42,
    repeatMode:
      typeof raw.repeatMode === "string"
        ? (raw.repeatMode as CanonicalPatch["repeatMode"])
        : "oneshot",
    roomEnabled: typeof raw.roomEnabled === "boolean" ? raw.roomEnabled : false,
  };

  if (DEV) {
    assertNoLegacyParams(canonical.params as Record<string, unknown>, "migrateToCanonical");
  }

  return canonical;
}
