/**
 * Mapping coverage: every non-experimental spec param must be consumed by mapping and reach EngineParams.
 * Tests fail if a spec param is added but not mapped (or not marked experimental).
 */

import { runMappingWithCoverage, getNonExperimentalSpecParamIds } from "../mapToEngine";
import type { CanonicalPatch } from "../types";
import { getEnvelopeSpec, getCanonicalEnvelopeDefaults, getMacroDefaults } from "@/audio/params";
import type { InstrumentType } from "@/types";

function buildCanonicalWithAllSpecDefaults(instrument: InstrumentType): CanonicalPatch {
  const envelopeParams = getCanonicalEnvelopeDefaults(instrument);
  const params = getMacroDefaults(instrument);
  return {
    schemaVersion: 1,
    instrument,
    params,
    envelopeParams,
    seed: 42,
    repeatMode: instrument === "snare" ? "oneshot" : undefined,
    roomEnabled: false,
  };
}

describe("mapping coverage", () => {
  const instruments: InstrumentType[] = ["kick", "snare", "hat"];

  it.each(instruments)(
    "every non-experimental spec param for %s is consumed by mapping and reaches EngineParams",
    (instrument) => {
      const spec = getEnvelopeSpec(instrument);
      const required = getNonExperimentalSpecParamIds(spec);
      const canonical = buildCanonicalWithAllSpecDefaults(instrument);
      const { engineParams, consumed } = runMappingWithCoverage(canonical, spec);

      const notConsumed = required.filter((id) => !consumed.has(id));
      expect(notConsumed).toEqual([]);

      for (const id of required) {
        expect(consumed.has(id)).toBe(true);
      }
    }
  );

  it("fails when a non-experimental spec param is not mapped (coverage regression)", () => {
    const spec = getEnvelopeSpec("kick");
    const required = getNonExperimentalSpecParamIds(spec);
    expect(required.length).toBeGreaterThan(0);
    const canonical = buildCanonicalWithAllSpecDefaults("kick");
    const { consumed } = runMappingWithCoverage(canonical, spec);
    for (const id of required) {
      expect(consumed.has(id)).toBe(true);
    }
  });
});
