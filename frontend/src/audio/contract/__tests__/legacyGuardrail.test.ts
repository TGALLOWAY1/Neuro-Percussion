/**
 * Test: legacy macro field must not be applied post-migration.
 * If someone passes a canonical-like object with legacy keys to mapCanonicalToEngineParams,
 * the contract should strip them at hydration; if legacy slips through to mapping output, we fail.
 */

import { hydratePatchToCanonical } from "../hydrate";
import { mapCanonicalToEngineParams } from "../mapToEngine";
import { LEGACY_PARAM_KEYS } from "../types";

describe("Legacy guardrail: no legacy fields post-migration", () => {
  it("canonical built via hydration has no legacy keys in params", () => {
    const patchLike = {
      params: {
        tone: 0.5,
        delayMix: 0.3,
        delayFeedback: 0.5,
      },
      seed: 42,
    };
    const canonical = hydratePatchToCanonical(patchLike, "snare");

    for (const key of LEGACY_PARAM_KEYS) {
      expect(canonical.params).not.toHaveProperty(key);
    }
  });

  it("engine params from mapCanonicalToEngineParams must not contain legacy keys", () => {
    const patchLike = {
      params: {
        punch_decay: 0.5,
        roomMix: 0.2,
        earlyReflections: 0.1,
      },
      envelopeParams: {},
      seed: 1,
    };
    const canonical = hydratePatchToCanonical(patchLike, "kick");
    const engine = mapCanonicalToEngineParams(canonical) as Record<string, unknown>;

    for (const key of LEGACY_PARAM_KEYS) {
      expect(engine).not.toHaveProperty(key);
    }
  });

  it("fails in dev if legacy is present in params passed to mapping (assertNoLegacyParams)", () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "development";
      const canonicalWithLegacy = {
        schemaVersion: 1 as const,
        instrument: "snare" as const,
        params: { tone: 0.5, delayMix: 0.3 },
        envelopeParams: {},
        seed: 42,
      };
      expect(() => mapCanonicalToEngineParams(canonicalWithLegacy as any)).toThrow(
        /Legacy fields must not be applied after hydration/
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
