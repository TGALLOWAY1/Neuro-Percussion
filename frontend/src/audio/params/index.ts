/**
 * Central export for parameter specifications.
 */

export * from "./types";
export * from "./ranges";
export * from "./defaults";
export * from "./researchGuidanceTypes";
export {
  parseResearchGuidance,
  VALID_UNITS,
  VALID_ROLES,
} from "./researchGuidanceLoader";
export { validateResearchGuidance } from "./validateResearchGuidance";
export { KICK_ENVELOPE_SPEC } from "./spec_kick";
export { SNARE_ENVELOPE_SPEC } from "./spec_snare";
export { HAT_ENVELOPE_SPEC } from "./spec_hat";

import { DrumParamSpec } from "./types";
import { KICK_ENVELOPE_SPEC } from "./spec_kick";
import { SNARE_ENVELOPE_SPEC } from "./spec_snare";
import { HAT_ENVELOPE_SPEC } from "./spec_hat";

/**
 * Get the envelope spec for an instrument.
 */
export function getEnvelopeSpec(instrument: "kick" | "snare" | "hat"): DrumParamSpec {
    switch (instrument) {
        case "kick":
            return KICK_ENVELOPE_SPEC;
        case "snare":
            return SNARE_ENVELOPE_SPEC;
        case "hat":
            return HAT_ENVELOPE_SPEC;
    }
}

/** All envelope param ids allowed for an instrument (from spec). Used to strip unknown keys. */
export function getAllowedEnvelopeParamIds(instrument: "kick" | "snare" | "hat"): ReadonlySet<string> {
    const spec = getEnvelopeSpec(instrument);
    const ids = spec.envelopes.flatMap((e) => e.params.map((p) => p.id));
    return new Set(ids);
}

/** All param ids in spec (envelope + macro). Used for control audit and to ensure no dead controls. */
export function getAllSpecParamIds(instrument: "kick" | "snare" | "hat"): { envelope: string[]; macro: string[] } {
    const spec = getEnvelopeSpec(instrument);
    const envelope = spec.envelopes.flatMap((e) => e.params.map((p) => p.id));
    const macro = (spec.macroParams ?? []).map((p) => p.id);
    return { envelope, macro };
}
