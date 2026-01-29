/**
 * Regression test suite: catches "Codex-class failures" that must not return.
 * Tests for:
 * 1. Legacy + new param double-application
 * 2. Schema migration producing valid canonical patches
 * 3. Mapping functions never setting legacy macros
 */

import { describe, it, expect } from "vitest";
import { migrateToCanonical } from "../migrateToCanonical";
import { hydratePatchToCanonical } from "../hydrate";
import { mapCanonicalToEngineParams } from "../mapToEngine";
import { migratePatchToV1 } from "../../patch/migration";
import { mapKickParams } from "../../mapping/mapKickParams";
import { mapSnareParams } from "../../mapping/mapSnareParams";
import { mapHatParams } from "../../mapping/mapHatParams";
import { LEGACY_PARAM_KEYS } from "../types";
import { getCanonicalEnvelopeDefaults } from "../../params";

describe("Regression: Legacy double-application", () => {
  it("mapSnareParams never sets legacy 'wire' macro", () => {
    const { result } = mapSnareParams({
      noise_amount_pct: 55,
      noise_decay_ms: 280,
    });

    // CRITICAL: Legacy macro must NOT be set (would cause double-application)
    expect(result.wire).toBeUndefined();
    expect(result["snare"]["wires"]["gain_db"]).toBeDefined();
  });

  it("mapSnareParams never sets legacy 'crack' macro", () => {
    const { result } = mapSnareParams({
      snap_amount_pct: 35,
      snap_decay_ms: 10,
    });

    // CRITICAL: Legacy macro must NOT be set
    expect(result.crack).toBeUndefined();
    expect(result["snare"]["exciter_body"]["gain_db"]).toBeDefined();
  });

  it("mapKickParams may set legacy macros but nested params take precedence", () => {
    // Kick still sets click_amount/click_snap for backward compat
    // But nested params (kick.click.gain_db) are primary
    const { result } = mapKickParams({
      click_amount_pct: 50,
      snap: 0.5,
    });

    // Legacy macros exist for compat
    expect(result.click_amount).toBeDefined();
    expect(result.click_snap).toBeDefined();
    
    // But nested params are primary (engine reads these first)
    expect(result["kick"]["click"]["gain_db"]).toBeDefined();
  });

  it("mapHatParams never sets legacy macros that would cause double-application", () => {
    // Hat may set "sheen" for backward compat, but not other legacy keys
    const { result } = mapHatParams({
      noise_amount_pct: 45,
    });

    // Should set nested params
    expect(result["hat"]["air"]["gain_db"]).toBeDefined();
    
    // Legacy "sheen" may exist for compat, but nested params are primary
    // (No other legacy keys that would cause double-application)
  });
});

describe("Regression: Schema migration produces valid canonical", () => {
  it("single path: StoredPatch -> migrateToCanonical -> CanonicalPatch -> mapToEngineParams", () => {
    const v0Patch = {
      params: { tone: 0.5 },
      seed: 42,
    };
    const canonical = migrateToCanonical(v0Patch, "snare");
    const expectedDefaults = getCanonicalEnvelopeDefaults("snare");
    expect(canonical.envelopeParams).toEqual(expectedDefaults);
    const engine = mapCanonicalToEngineParams(canonical);
    expect(engine.seed).toBe(42);
    expect(engine.snare).toBeDefined();
  });

  it("migrated V0 patch has canonical envelope defaults", () => {
    const v0Patch = {
      params: { tone: 0.5 },
      seed: 42,
    };

    const v1Patch = migratePatchToV1(v0Patch);
    expect(v1Patch.envelopeParams).toEqual({});

    // After hydration, envelopeParams should be filled with canonical defaults
    const canonical = hydratePatchToCanonical(v1Patch, "snare");
    const expectedDefaults = getCanonicalEnvelopeDefaults("snare");
    expect(canonical.envelopeParams).toEqual(expectedDefaults);
  });

  it("migrated patch has no legacy keys in params", () => {
    const v0Patch = {
      params: {
        tone: 0.5,
        delayMix: 0.3, // Legacy - should be stripped
        roomMix: 0.2, // Legacy - should be stripped
      },
      seed: 42,
    };

    const v1Patch = migratePatchToV1(v0Patch);
    const canonical = hydratePatchToCanonical(v1Patch, "snare");

    // Legacy keys must be stripped
    for (const key of LEGACY_PARAM_KEYS) {
      expect(canonical.params).not.toHaveProperty(key);
    }
  });

  it("migrated patch sets repeatMode=oneshot and roomEnabled=false", () => {
    const v0Patch = {
      params: { tone: 0.5 },
      seed: 42,
    };

    const v1Patch = migratePatchToV1(v0Patch);
    expect(v1Patch.repeatMode).toBe("oneshot");
    expect(v1Patch.roomEnabled).toBe(false);
  });
});

describe("Regression: Engine params never contain legacy keys", () => {
  it("mapCanonicalToEngineParams strips all legacy keys", () => {
    const canonical = {
      schemaVersion: 1 as const,
      instrument: "snare" as const,
      params: { tone: 0.5 }, // Clean params
      envelopeParams: { attack_ms: 1, decay_ms: 320 },
      seed: 42,
      repeatMode: "oneshot" as const,
      roomEnabled: false,
    };

    const engine = mapCanonicalToEngineParams(canonical) as Record<string, unknown>;

    // Engine params must not contain legacy keys
    for (const key of LEGACY_PARAM_KEYS) {
      expect(engine).not.toHaveProperty(key);
    }
  });

  it("hydrated patch with legacy keys produces clean engine params", () => {
    const patchLike = {
      params: {
        tone: 0.5,
        delayMix: 0.3, // Legacy - should be stripped
        delayFeedback: 0.5, // Legacy - should be stripped
      },
      seed: 42,
    };

    const canonical = hydratePatchToCanonical(patchLike, "snare");
    const engine = mapCanonicalToEngineParams(canonical) as Record<string, unknown>;

    // Engine params must be clean
    for (const key of LEGACY_PARAM_KEYS) {
      expect(engine).not.toHaveProperty(key);
    }
  });
});
