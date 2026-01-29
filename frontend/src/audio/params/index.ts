/**
 * Central export for parameter specifications.
 */

export * from "./types";
export * from "./ranges";
export * from "./defaults";
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
