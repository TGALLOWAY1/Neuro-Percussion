/**
 * Types for the parsed RESEARCH_GUIDANCE.md spec.
 * Single source of truth: docs/RESEARCH_GUIDANCE.md
 * Used by UI, migration, mapping, and validate_research_guidance script.
 */

/** Allowed units from RESEARCH_GUIDANCE (normative). */
export type ResearchParamUnit =
  | "ms"
  | "hz"
  | "st"
  | "db"
  | "linear_0_1"
  | "ratio"
  | "bool"
  | "enum";

/** Allowed roles for parameters. */
export type ResearchParamRole =
  | "transient"
  | "body"
  | "noise"
  | "mix"
  | "fx"
  | "qc"
  | "behavior"
  | "env"
  | "filter"
  | "core";

/**
 * Single parameter record as defined in RESEARCH_GUIDANCE.md tables.
 * Required: id, label, unit, min, max, default, role.
 */
export interface ResearchParamRecord {
  id: string;
  label: string;
  unit: ResearchParamUnit;
  min: number | string; // number or enum/bool as string
  max: number | string;
  default: number | string;
  role: ResearchParamRole;
  description?: string;
  notes?: string;
  experimental?: boolean;
  deprecated?: boolean;
  replaced_by?: string;
}

/** One deprecated parameter entry (legacy id -> replaced_by). */
export interface DeprecatedParamEntry {
  legacyId: string;
  replacedBy?: string;
}

/** Gating rule (MUST) from RESEARCH_GUIDANCE. */
export interface GatingRule {
  id: string;
  description: string;
}

/**
 * Full parsed spec from RESEARCH_GUIDANCE.md.
 * Can be imported by UI, migration, mapping, and CI validator.
 */
export interface ResearchParamSpec {
  schemaVersion: number;
  lastUpdated?: string;
  params: ResearchParamRecord[];
  gatingRules: GatingRule[];
  deprecated: DeprecatedParamEntry[];
}

/** Validation result from validate_research_guidance. */
export interface ResearchGuidanceValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}
