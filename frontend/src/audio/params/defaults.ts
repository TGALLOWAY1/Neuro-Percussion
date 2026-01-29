/**
 * Single source of truth for canonical envelope defaults.
 * Derived from spec_kick / spec_snare / spec_hat. Used by:
 * - New patch creation (AuditionView)
 * - Migration (hydration fills empty envelopeParams)
 * - Preset load (hydration merges under canonical defaults)
 */

import { KICK_ENVELOPE_SPEC } from "./spec_kick";
import { SNARE_ENVELOPE_SPEC } from "./spec_snare";
import { HAT_ENVELOPE_SPEC } from "./spec_hat";

export type CanonicalInstrument = "kick" | "snare" | "hat";

function envelopeDefaultsFromSpec(spec: { envelopes: { params: { id: string; default: number }[] }[] }): Record<string, number> {
  const out: Record<string, number> = {};
  for (const env of spec.envelopes) {
    for (const p of env.params) {
      out[p.id] = p.default;
    }
  }
  return out;
}

const KICK_DEFAULTS = envelopeDefaultsFromSpec(KICK_ENVELOPE_SPEC);
const SNARE_DEFAULTS = envelopeDefaultsFromSpec(SNARE_ENVELOPE_SPEC);
const HAT_DEFAULTS = envelopeDefaultsFromSpec(HAT_ENVELOPE_SPEC);

/**
 * Canonical envelope defaults per instrument. Single source for new patch, migration, and hydration.
 */
export function getCanonicalEnvelopeDefaults(instrument: CanonicalInstrument): Record<string, number> {
  switch (instrument) {
    case "kick":
      return { ...KICK_DEFAULTS };
    case "snare":
      return { ...SNARE_DEFAULTS };
    case "hat":
      return { ...HAT_DEFAULTS };
  }
}

/** All canonical envelope defaults (for snapshot / tests). */
export const CANONICAL_ENVELOPE_DEFAULTS: Record<CanonicalInstrument, Record<string, number>> = {
  kick: KICK_DEFAULTS,
  snare: SNARE_DEFAULTS,
  hat: HAT_DEFAULTS,
};
