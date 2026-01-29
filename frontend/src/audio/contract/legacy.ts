/**
 * Legacy field detection and stripping.
 * Guardrails: in dev mode, throw if legacy fields are present downstream of hydration.
 */

import { LEGACY_PARAM_KEYS, type LegacyParamKey } from "./types";

const DEV =
  typeof process !== "undefined" &&
  process.env?.NODE_ENV !== "production";

/**
 * Returns legacy keys present in `params` (top-level only).
 */
export function getLegacyKeysInParams(params: Record<string, unknown>): LegacyParamKey[] {
  return LEGACY_PARAM_KEYS.filter((key) => key in params) as LegacyParamKey[];
}

/**
 * Strip legacy keys from a params object. Returns a new object.
 */
export function stripLegacyParams<T extends Record<string, unknown>>(params: T): T {
  const out = { ...params };
  for (const key of LEGACY_PARAM_KEYS) {
    delete (out as Record<string, unknown>)[key];
  }
  return out;
}

/**
 * In dev mode, throw if any legacy keys are present in `params`.
 * Call this downstream of hydration to enforce the contract.
 */
export function assertNoLegacyParams(params: Record<string, unknown>, context: string): void {
  if (!DEV) return;
  const found = getLegacyKeysInParams(params);
  if (found.length > 0) {
    throw new Error(
      `[Parameter Contract] Legacy fields must not be applied after hydration. Context: ${context}. Found: ${found.join(", ")}`
    );
  }
}
