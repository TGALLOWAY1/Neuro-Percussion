/**
 * Hydrate: thin wrapper over migrateToCanonical.
 * Single path: StoredPatch -> migrateToCanonical -> CanonicalPatch -> mapToEngineParams.
 * No other code path merges parameters.
 */

import type { InstrumentType } from "@/types";
import type { CanonicalPatch } from "./types";
import { migrateToCanonical } from "./migrateToCanonical";

export type { PatchLike } from "./migrateToCanonical";

/**
 * Hydrate any patch-like value to CanonicalPatch.
 * Delegates to migrateToCanonical (single path).
 */
export function hydratePatchToCanonical(
  patchLike: Parameters<typeof migrateToCanonical>[0],
  instrument: InstrumentType
): CanonicalPatch {
  return migrateToCanonical(patchLike, instrument);
}
