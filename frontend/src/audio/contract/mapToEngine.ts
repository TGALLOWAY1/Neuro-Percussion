/**
 * Single entry point: map CanonicalPatch -> EngineParams.
 * This is the only path that produces the payload sent to the API / instrument DSP.
 * Spec-driven: clamp at every boundary using spec min/max; warn when a spec param is ignored.
 */

import type { InstrumentType } from "@/types";
import type { CanonicalPatch, EngineParams } from "./types";
import type { DrumParamSpec, ParamSpec } from "@/audio/params/types";
import { getEnvelopeSpec } from "@/audio/params";
import { assertNoLegacyParams } from "./legacy";
import { clampParamsToSpec } from "./units";
import { mapKickParams } from "../mapping/mapKickParams";
import { mapSnareParams } from "../mapping/mapSnareParams";
import { mapHatParams } from "../mapping/mapHatParams";

const DEV = typeof process !== "undefined" && process.env.NODE_ENV === "development";

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key in source) {
    const s = source[key];
    if (s != null && typeof s === "object" && !Array.isArray(s)) {
      const t = result[key];
      result[key] = deepMerge(
        (typeof t === "object" && t != null && !Array.isArray(t) ? t : {}) as Record<string, unknown>,
        s as Record<string, unknown>
      );
    } else {
      result[key] = s;
    }
  }
  return result;
}

/** Build param id -> ParamSpec from DrumParamSpec (envelopes + macroParams). */
export function buildSpecParamById(spec: DrumParamSpec): Map<string, ParamSpec> {
  const byId = new Map<string, ParamSpec>();
  for (const env of spec.envelopes) {
    for (const p of env.params) byId.set(p.id, p);
  }
  for (const p of spec.macroParams ?? []) byId.set(p.id, p);
  return byId;
}

/** All spec param ids that must be consumed by mapping (non-experimental). */
export function getNonExperimentalSpecParamIds(spec: DrumParamSpec): string[] {
  const ids: string[] = [];
  for (const env of spec.envelopes) {
    for (const p of env.params) {
      if (!p.experimental) ids.push(p.id);
    }
  }
  for (const p of spec.macroParams ?? []) {
    if (!p.experimental) ids.push(p.id);
  }
  return ids;
}

export interface RunMappingResult {
  engineParams: EngineParams;
  consumed: Set<string>;
}

/**
 * Map canonical to engine params and return the set of spec param ids that were consumed.
 * Used by mapCanonicalToEngineParams and by coverage tests.
 */
export function runMappingWithCoverage(canonical: CanonicalPatch, spec: DrumParamSpec): RunMappingResult {
  const { instrument, params: macroParams, envelopeParams, seed, repeatMode, roomEnabled } = canonical;
  const specById = buildSpecParamById(spec);
  const clampedEnvelope = clampParamsToSpec(envelopeParams, specById);
  const clampedMacro = clampParamsToSpec(macroParams, specById);

  const consumed = new Set<string>();

  let mapped: Record<string, unknown> = {};
  if (instrument === "kick") {
    const { result, consumed: envConsumed } = mapKickParams(clampedEnvelope as Parameters<typeof mapKickParams>[0]);
    mapped = result;
    envConsumed.forEach((id) => consumed.add(id));
    const kick: Record<string, unknown> = (mapped["kick"] as Record<string, unknown>) || {};
    const room = (kick["room"] as Record<string, unknown>) || {};
    room["enabled"] = roomEnabled ?? false;
    kick["room"] = room;
    mapped["kick"] = kick;
  } else if (instrument === "snare") {
    const { result, consumed: envConsumed } = mapSnareParams(clampedEnvelope as Parameters<typeof mapSnareParams>[0]);
    mapped = result;
    envConsumed.forEach((id) => consumed.add(id));
    const snare: Record<string, unknown> = (mapped["snare"] as Record<string, unknown>) || {};
    snare["repeatMode"] = repeatMode ?? "oneshot";
    const shell = (snare["shell"] as Record<string, unknown>) || {};
    if ((repeatMode ?? "oneshot") === "oneshot") {
      shell["feedback"] = 0.0;
    }
    snare["shell"] = shell;
    const room = (snare["room"] as Record<string, unknown>) || {};
    room["enabled"] = roomEnabled ?? false;
    if (!(roomEnabled ?? false)) {
      room["mute"] = true;
      room["gain_db"] = -200.0;
    }
    snare["room"] = room;
    mapped["snare"] = snare;
  } else if (instrument === "hat") {
    const { result, consumed: envConsumed } = mapHatParams(clampedEnvelope as Parameters<typeof mapHatParams>[0]);
    mapped = result;
    envConsumed.forEach((id) => consumed.add(id));
  }

  const merged = deepMerge(
    { ...clampedMacro } as Record<string, unknown>,
    mapped
  ) as Record<string, unknown>;
  merged["seed"] = seed;
  Object.keys(clampedMacro).forEach((id) => consumed.add(id));

  assertNoLegacyParams(merged, "mapCanonicalToEngineParams");

  const required = getNonExperimentalSpecParamIds(spec);
  const ignored = required.filter((id) => !consumed.has(id));
  if (DEV && ignored.length > 0) {
    console.warn(
      `[mapCanonicalToEngineParams] Spec params not consumed by mapping (add mapping or mark experimental): ${ignored.join(", ")}. Instrument: ${instrument}.`
    );
  }

  return { engineParams: merged as EngineParams, consumed };
}

/**
 * Map a canonical patch to engine params (the only object allowed to reach instrument DSP).
 * When spec is omitted, it is resolved from canonical.instrument via getEnvelopeSpec.
 * Clamps all params at spec boundaries; warns in dev when a non-experimental spec param is ignored.
 */
export function mapCanonicalToEngineParams(canonical: CanonicalPatch, spec?: DrumParamSpec): EngineParams {
  const resolvedSpec = spec ?? getEnvelopeSpec(canonical.instrument);
  const { engineParams } = runMappingWithCoverage(canonical, resolvedSpec);
  return engineParams;
}
