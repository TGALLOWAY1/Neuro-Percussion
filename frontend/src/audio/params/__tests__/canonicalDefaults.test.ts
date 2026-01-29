/**
 * Snapshot test for canonical envelope defaults per drum.
 * Ensures single source of truth (spec) is stable and migration/hydration match.
 */

import { describe, it, expect } from "vitest";
import {
  getCanonicalEnvelopeDefaults,
  getCanonicalPatchDefaults,
  CANONICAL_ENVELOPE_DEFAULTS,
  type CanonicalInstrument,
} from "../defaults";

const INSTRUMENTS: CanonicalInstrument[] = ["kick", "snare", "hat"];

describe("Canonical defaults (spec-derived)", () => {
  it("getCanonicalEnvelopeDefaults matches CANONICAL_ENVELOPE_DEFAULTS per instrument", () => {
    for (const inst of INSTRUMENTS) {
      const fromFn = getCanonicalEnvelopeDefaults(inst);
      const fromConst = CANONICAL_ENVELOPE_DEFAULTS[inst];
      expect(fromFn).toEqual(fromConst);
    }
  });

  it("kick canonical patch defaults snapshot (params + envelopeParams from spec)", () => {
    expect(getCanonicalPatchDefaults("kick")).toMatchInlineSnapshot(`
      {
        "envelopeParams": {
          "attack_ms": 1,
          "click_amount_pct": 35,
          "click_attack_ms": 0,
          "click_decay_ms": 12,
          "click_tone_hz": 6000,
          "curve": 1.6,
          "decay_ms": 220,
          "end_pitch_offset_st": 0,
          "hold_ms": 5,
          "pitch_curve": 1.3,
          "pitch_decay_ms": 60,
          "snap": 0.5,
          "start_pitch_st": 24,
        },
        "params": {
          "blend": 0.3,
          "click_amount": 0.5,
          "click_snap": 0.5,
          "distance_ms": 20,
          "punch_decay": 0.5,
          "room_air": 0.3,
          "room_tone_freq": 150,
        },
      }
    `);
  });

  it("snare canonical patch defaults snapshot (params + envelopeParams from spec)", () => {
    expect(getCanonicalPatchDefaults("snare")).toMatchInlineSnapshot(`
      {
        "envelopeParams": {
          "attack_ms": 1,
          "body_amount_pct": 45,
          "body_decay_ms": 180,
          "body_pitch_hz": 200,
          "curve": 1.4,
          "decay_ms": 320,
          "noise_amount_pct": 55,
          "noise_band_center_hz": 5000,
          "noise_band_q": 1.2,
          "noise_color": 0.6,
          "noise_decay_ms": 280,
          "snap_amount_pct": 35,
          "snap_decay_ms": 10,
          "snap_tone_hz": 7000,
        },
        "params": {
          "body": 0.5,
          "crack": 0.5,
          "tone": 0.5,
          "wire": 0.4,
        },
      }
    `);
  });

  it("hat canonical patch defaults snapshot (params + envelopeParams from spec)", () => {
    expect(getCanonicalPatchDefaults("hat")).toMatchInlineSnapshot(`
      {
        "envelopeParams": {
          "air_pct": 10,
          "attack_ms": 0.5,
          "brightness_hz": 9000,
          "choke": 1,
          "curve": 1.2,
          "decay_ms": 90,
          "hpf_cutoff_hz": 6000,
          "inharmonicity": 0.55,
          "metal_amount_pct": 65,
          "micro_delay_ms": 6,
          "noise_amount_pct": 45,
          "noise_color": 0.75,
          "width_pct": 110,
        },
        "params": {
          "color": 0.5,
          "dirt": 0.2,
          "sheen": 0.4,
          "tightness": 0.5,
        },
      }
    `);
  });

  it("kick canonical envelope defaults snapshot", () => {
    expect(getCanonicalEnvelopeDefaults("kick")).toMatchInlineSnapshot(`
      {
        "attack_ms": 1,
        "click_amount_pct": 35,
        "click_attack_ms": 0,
        "click_decay_ms": 12,
        "click_tone_hz": 6000,
        "curve": 1.6,
        "decay_ms": 220,
        "end_pitch_offset_st": 0,
        "hold_ms": 5,
        "pitch_curve": 1.3,
        "pitch_decay_ms": 60,
        "snap": 0.5,
        "start_pitch_st": 24,
      }
    `);
  });

  it("snare canonical envelope defaults snapshot", () => {
    expect(getCanonicalEnvelopeDefaults("snare")).toMatchInlineSnapshot(`
      {
        "attack_ms": 1,
        "body_amount_pct": 45,
        "body_decay_ms": 180,
        "body_pitch_hz": 200,
        "curve": 1.4,
        "decay_ms": 320,
        "noise_amount_pct": 55,
        "noise_band_center_hz": 5000,
        "noise_band_q": 1.2,
        "noise_color": 0.6,
        "noise_decay_ms": 280,
        "snap_amount_pct": 35,
        "snap_decay_ms": 10,
        "snap_tone_hz": 7000,
      }
    `);
  });

  it("hat canonical envelope defaults snapshot", () => {
    expect(getCanonicalEnvelopeDefaults("hat")).toMatchInlineSnapshot(`
      {
        "air_pct": 10,
        "attack_ms": 0.5,
        "brightness_hz": 9000,
        "choke": 1,
        "curve": 1.2,
        "decay_ms": 90,
        "hpf_cutoff_hz": 6000,
        "inharmonicity": 0.55,
        "metal_amount_pct": 65,
        "micro_delay_ms": 6,
        "noise_amount_pct": 45,
        "noise_color": 0.75,
        "width_pct": 110,
      }
    `);
  });
});
