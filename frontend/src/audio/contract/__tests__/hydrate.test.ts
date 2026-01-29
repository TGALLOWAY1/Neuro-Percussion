/**
 * Unit tests for hydratePatchToCanonical.
 */

import { hydratePatchToCanonical } from "../hydrate";
import type { PatchLike } from "../hydrate";
import { LEGACY_PARAM_KEYS } from "../types";
import { getCanonicalEnvelopeDefaults } from "../../params";

describe("hydratePatchToCanonical", () => {
  it("returns CanonicalPatch with instrument and schemaVersion 1", () => {
    const patchLike: PatchLike = {
      params: { tone: 0.5 },
      seed: 42,
    };
    const canonical = hydratePatchToCanonical(patchLike, "snare");

    expect(canonical.schemaVersion).toBe(1);
    expect(canonical.instrument).toBe("snare");
    expect(canonical.params).toEqual({ tone: 0.5 });
    expect(canonical.seed).toBe(42);
    expect(canonical.envelopeParams).toEqual(getCanonicalEnvelopeDefaults("snare"));
    expect(canonical.repeatMode).toBe("oneshot");
    expect(canonical.roomEnabled).toBe(false);
  });

  it("strips legacy param keys from params", () => {
    const patchLike: PatchLike = {
      params: {
        tone: 0.5,
        delayMix: 0.3,
        roomMix: 0.2,
      },
      seed: 42,
    };
    const canonical = hydratePatchToCanonical(patchLike, "snare");

    expect(canonical.params).toHaveProperty("tone", 0.5);
    expect(canonical.params).not.toHaveProperty("delayMix");
    expect(canonical.params).not.toHaveProperty("roomMix");
  });

  it("preserves V1 repeatMode and roomEnabled when present", () => {
    const patchLike: PatchLike = {
      schemaVersion: 1,
      params: {},
      envelopeParams: {},
      seed: 1,
      repeatMode: "echo",
      roomEnabled: true,
    };
    const canonical = hydratePatchToCanonical(patchLike, "snare");

    expect(canonical.repeatMode).toBe("echo");
    expect(canonical.roomEnabled).toBe(true);
    expect(canonical.envelopeParams).toEqual(getCanonicalEnvelopeDefaults("snare"));
  });

  it("migrated legacy (empty envelopeParams) produces same canonical envelope defaults as new patch", () => {
    const legacyLike: PatchLike = {
      params: { tone: 0.5 },
      seed: 42,
    };
    for (const instrument of ["kick", "snare", "hat"] as const) {
      const canonical = hydratePatchToCanonical(legacyLike, instrument);
      const expectedEnvelope = getCanonicalEnvelopeDefaults(instrument);
      expect(canonical.envelopeParams).toEqual(expectedEnvelope);
    }
  });

  it("merges raw envelopeParams over canonical defaults", () => {
    const patchLike: PatchLike = {
      schemaVersion: 1,
      params: {},
      envelopeParams: { decay_ms: 100 },
      seed: 42,
    };
    const canonical = hydratePatchToCanonical(patchLike, "kick");

    expect(canonical.envelopeParams.decay_ms).toBe(100);
    expect(canonical.envelopeParams.attack_ms).toBe(1);
    expect(canonical.envelopeParams.start_pitch_st).toBe(24);
  });

  it("output has no legacy keys (shape check)", () => {
    const withLegacy: PatchLike = {
      params: {
        punch_decay: 0.5,
        delayMix: 0.1,
        delayFeedback: 0.2,
      },
      seed: 99,
    };
    const canonical = hydratePatchToCanonical(withLegacy, "kick");

    for (const key of LEGACY_PARAM_KEYS) {
      expect(canonical.params).not.toHaveProperty(key);
    }
  });
});
