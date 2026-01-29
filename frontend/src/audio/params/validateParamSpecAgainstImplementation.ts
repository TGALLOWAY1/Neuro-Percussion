/**
 * Conformance validator: checks that implementation defaults/ranges match
 * the NotebookLM research spec (or explicitly overridden).
 */

import type { ResearchSpecInstrument } from "./researchSpec";
import { RESEARCH_PARAM_SPEC } from "./researchSpec";
import { KICK_ENVELOPE_SPEC } from "./spec_kick";
import { SNARE_ENVELOPE_SPEC } from "./spec_snare";
import { HAT_ENVELOPE_SPEC } from "./spec_hat";
import type { ParamSpec } from "./types";

export interface ConformanceResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Optional overrides: "instrument.paramId" -> { default?, min?, max? } when we intentionally deviate from research. */
export type OverridesMap = Record<string, Partial<{ default: number; min: number; max: number }>>;

const UNIT_ALIAS: Record<string, string> = {
  x: "linear",
  linear: "x",
  pct: "pct",
  ms: "ms",
  hz: "hz",
  st: "st",
  db: "db",
  bool: "bool",
};

function unitMatches(specUnit: string, implUnit: string): boolean {
  const s = specUnit.toLowerCase();
  const i = implUnit.toLowerCase();
  if (s === i) return true;
  if (UNIT_ALIAS[s] === i || UNIT_ALIAS[i] === s) return true;
  if ((s === "linear" && i === "x") || (s === "x" && i === "linear")) return true;
  return false;
}

function flattenSpec(spec: { envelopes: { params: ParamSpec[] }[] }): ParamSpec[] {
  const out: ParamSpec[] = [];
  for (const env of spec.envelopes) {
    for (const p of env.params) {
      out.push(p);
    }
  }
  return out;
}

const IMPL_SPECS: Record<ResearchSpecInstrument, { envelopes: { params: ParamSpec[] }[] }> = {
  kick: KICK_ENVELOPE_SPEC,
  snare: SNARE_ENVELOPE_SPEC,
  hat: HAT_ENVELOPE_SPEC,
};

/** Param ids that mapping layers consume (must be in research or UI spec). */
const MAPPING_PARAM_IDS: Record<ResearchSpecInstrument, string[]> = {
  kick: [
    "attack_ms", "hold_ms", "decay_ms", "curve",
    "start_pitch_st", "pitch_decay_ms", "pitch_curve", "end_pitch_offset_st",
    "click_amount_pct", "click_attack_ms", "click_decay_ms", "click_tone_hz", "snap",
  ],
  snare: [
    "attack_ms", "decay_ms", "curve",
    "body_pitch_hz", "body_decay_ms", "body_amount_pct",
    "noise_amount_pct", "noise_decay_ms", "noise_color", "noise_band_center_hz", "noise_band_q",
    "snap_amount_pct", "snap_decay_ms", "snap_tone_hz",
  ],
  hat: [
    "attack_ms", "decay_ms", "curve", "choke",
    "metal_amount_pct", "inharmonicity", "brightness_hz",
    "noise_amount_pct", "noise_color", "hpf_cutoff_hz",
    "width_pct", "micro_delay_ms", "air_pct",
  ],
};

/**
 * Validates that:
 * - UI defaults/min/max/unit match research spec (or overrides).
 * - Mapping param ids are present in research spec (explicit conversions).
 */
export function validateParamSpecAgainstImplementation(
  overrides: OverridesMap = {}
): ConformanceResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const instrument of ["kick", "snare", "hat"] as ResearchSpecInstrument[]) {
    const research = RESEARCH_PARAM_SPEC[instrument];
    const implSpec = IMPL_SPECS[instrument];
    const params = flattenSpec(implSpec);

    for (const p of params) {
      const key = `${instrument}.${p.id}`;
      const override = overrides[key];
      const res = research[p.id];

      if (res) {
        const def = override?.default ?? res.default;
        const min = override?.min ?? res.min;
        const max = override?.max ?? res.max;

        if (p.default !== def) {
          errors.push(`${key}: default mismatch — implementation=${p.default}, spec=${res.default}${override?.default !== undefined ? " (overridden)" : ""}`);
        }
        if (p.min !== min) {
          errors.push(`${key}: min mismatch — implementation=${p.min}, spec=${res.min}${override?.min !== undefined ? " (overridden)" : ""}`);
        }
        if (p.max !== max) {
          errors.push(`${key}: max mismatch — implementation=${p.max}, spec=${res.max}${override?.max !== undefined ? " (overridden)" : ""}`);
        }
        if (!unitMatches(res.unit, p.unit)) {
          warnings.push(`${key}: unit mismatch — implementation=${p.unit}, spec=${res.unit}`);
        }
      } else {
        warnings.push(`${key}: in UI but not in research spec (optional param)`);
      }
    }

    // Mapping conformance: every param used by mapping should be in research or UI
    const mappingIds = MAPPING_PARAM_IDS[instrument];
    const uiIds = new Set(params.map((x) => x.id));
    for (const id of mappingIds) {
      if (!research[id] && !uiIds.has(id)) {
        errors.push(`${instrument} mapping uses param "${id}" which is not in research spec or UI spec`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
