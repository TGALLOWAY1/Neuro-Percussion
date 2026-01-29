/**
 * Conformance test: implementation defaults/ranges must match research spec
 * (or be explicitly overridden). Fails if defaults/ranges drift.
 */

import { describe, it, expect } from "vitest";
import {
  validateParamSpecAgainstImplementation,
  type OverridesMap,
} from "../validateParamSpecAgainstImplementation";

/** Intentional overrides vs RESEARCH_GUIDANCE.md (documented drift). */
const DOCUMENTED_OVERRIDES: OverridesMap = {
  // Kick: UI uses wider/tighter ranges and different defaults for playability
  "kick.attack_ms": { default: 1 },
  "kick.decay_ms": { default: 220, min: 30, max: 2500 },
  "kick.start_pitch_st": { max: 48 },
  "kick.pitch_decay_ms": { default: 60, min: 5, max: 250 },
  "kick.click_amount_pct": { default: 35 },
  "kick.click_attack_ms": { default: 0, max: 3 },
  "kick.click_tone_hz": { min: 1000, max: 12000 },
  "kick.snap": { default: 0.5 },
  // Snare: UI ranges and defaults differ from research spec
  "snare.attack_ms": { max: 5 },
  "snare.body_pitch_hz": { max: 400 },
  "snare.body_decay_ms": { default: 180, min: 30, max: 800 },
  "snare.noise_amount_pct": { default: 55 },
  "snare.noise_decay_ms": { default: 280, min: 20, max: 2000 },
  "snare.noise_band_center_hz": { max: 12000 },
  // Hat: UI uses wider decay range and different metal defaults
  "hat.decay_ms": { default: 90, min: 10, max: 2500 },
  "hat.inharmonicity": { default: 0.55 },
  "hat.hpf_cutoff_hz": { default: 6000, min: 2000, max: 12000 },
  "hat.brightness_hz": { default: 9000, min: 2000, max: 16000 },
};

describe("Param spec conformance", () => {
  it("fails if defaults or ranges drift from research spec without override", () => {
    const result = validateParamSpecAgainstImplementation(DOCUMENTED_OVERRIDES);

    expect(result.ok, result.errors.join("\n")).toBe(true);
    if (result.warnings.length > 0) {
      console.warn("Conformance warnings:", result.warnings);
    }
  });

  it("fails when overrides are missing for known drift", () => {
    const result = validateParamSpecAgainstImplementation({});

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("reports mapping param ids that are not in spec", () => {
    const result = validateParamSpecAgainstImplementation(DOCUMENTED_OVERRIDES);

    const mappingErrors = result.errors.filter((e) => e.includes("mapping uses"));
    expect(mappingErrors.length).toBe(0);
  });
});
