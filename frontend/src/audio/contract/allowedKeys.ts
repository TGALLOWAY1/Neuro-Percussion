/**
 * Allowed parameter keys per instrument (canonical only).
 * Used by migrateToCanonical to strip unknown keys.
 * Source: ParamSpec (getEnvelopeSpec); single source of truth for "known" keys.
 */

import type { InstrumentType } from "@/types";
import { getAllSpecParamIds } from "@/audio/params";

export function getAllowedMacroKeys(instrument: InstrumentType): ReadonlySet<string> {
  const { macro } = getAllSpecParamIds(instrument);
  return new Set(macro);
}
