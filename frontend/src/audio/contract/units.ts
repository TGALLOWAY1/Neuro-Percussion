/**
 * Unit conversion and clamping for mapping CanonicalPatch -> EngineParams.
 * Explicit helpers used by mapCanonicalToEngineParams; all boundaries use spec min/max.
 */

import type { ParamSpec } from "@/audio/params/types";
import { clamp as clampNum, msToSeconds, stToRatio, dbToLinear } from "@/audio/units";

/** ms -> s (for engine params that expect seconds) */
export function msToS(ms: number): number {
  return msToSeconds(ms);
}

/** Semitones -> frequency ratio 2^(st/12) */
export function stToRatioFromSt(st: number): number {
  return stToRatio(st);
}

/** dB -> linear gain 10^(db/20) */
export function dbToLinearGain(db: number): number {
  return dbToLinear(db);
}

/** Clamp value to [min, max] */
export function clamp(value: number, min: number, max: number): number {
  return clampNum(value, min, max);
}

/** Clamp value using spec min/max; used at every mapping boundary */
export function clampSpec(value: number, spec: { min: number; max: number }): number {
  return clampNum(value, spec.min, spec.max);
}

/** Clamp a record of param values using specById; returns new record */
export function clampParamsToSpec(
  params: Record<string, number>,
  specById: Map<string, ParamSpec>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, value] of Object.entries(params)) {
    const s = specById.get(id);
    out[id] = s ? clampSpec(value, s) : value;
  }
  return out;
}
