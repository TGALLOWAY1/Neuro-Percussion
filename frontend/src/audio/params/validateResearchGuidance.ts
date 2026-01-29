/**
 * Validates parsed RESEARCH_GUIDANCE spec.
 * Fails on: duplicate ids, missing required fields, invalid units, defaults out of range.
 * Used by scripts/validate_research_guidance.ts for CI.
 */

import type {
  ResearchParamSpec,
  ResearchParamRecord,
  ResearchParamUnit,
  ResearchParamRole,
  ResearchGuidanceValidationResult,
} from "./researchGuidanceTypes";
import { VALID_UNITS, VALID_ROLES } from "./researchGuidanceLoader";

const REQUIRED_FIELDS: (keyof ResearchParamRecord)[] = [
  "id",
  "label",
  "unit",
  "min",
  "max",
  "default",
  "role",
];

function isNumeric(x: number | string): x is number {
  return typeof x === "number" && !Number.isNaN(x);
}

function inRange(
  value: number | string,
  min: number | string,
  max: number | string
): boolean {
  if (typeof value !== "number" || typeof min !== "number" || typeof max !== "number")
    return true; // enum/bool: skip range check
  return value >= min && value <= max;
}

/**
 * Validate parsed spec. Returns errors and warnings; ok is false if any errors.
 */
export function validateResearchGuidance(
  spec: ResearchParamSpec
): ResearchGuidanceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const ids = new Set<string>();
  for (const p of spec.params) {
    if (ids.has(p.id)) errors.push(`Duplicate parameter id: ${p.id}`);
    ids.add(p.id);

    for (const field of REQUIRED_FIELDS) {
      const val = p[field];
      if (val === undefined || val === null || val === "")
        errors.push(`Parameter ${p.id}: missing required field '${field}'`);
    }

    if (!VALID_UNITS.includes(p.unit as ResearchParamUnit))
      errors.push(
        `Parameter ${p.id}: invalid unit '${p.unit}'. Allowed: ${VALID_UNITS.join(", ")}`
      );

    if (!VALID_ROLES.includes(p.role as ResearchParamRole))
      errors.push(
        `Parameter ${p.id}: invalid role '${p.role}'. Allowed: ${VALID_ROLES.join(", ")}`
      );

    if (isNumeric(p.min) && isNumeric(p.max) && p.min > p.max)
      errors.push(`Parameter ${p.id}: min (${p.min}) > max (${p.max})`);

    if (isNumeric(p.default) && isNumeric(p.min) && isNumeric(p.max)) {
      if (!inRange(p.default, p.min, p.max))
        errors.push(
          `Parameter ${p.id}: default (${p.default}) out of range [${p.min}, ${p.max}]`
        );
    }
  }

  if (spec.params.length === 0)
    errors.push("No parameters found in spec (check table format in RESEARCH_GUIDANCE.md)");

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
