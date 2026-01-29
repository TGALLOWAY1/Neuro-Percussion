#!/usr/bin/env npx tsx
/**
 * Validates RESEARCH_GUIDANCE.md against ParamSpec rules.
 * Fails CI (exit 1) on: duplicate ids, missing required fields, invalid units, defaults out of range.
 * Run: npm run validate:research
 * Expects docs/RESEARCH_GUIDANCE.md at repo root (parent of frontend).
 */

import * as fs from "fs";
import * as path from "path";
import { parseResearchGuidance } from "../src/audio/params/researchGuidanceLoader";
import { validateResearchGuidance } from "../src/audio/params/validateResearchGuidance";

function main(): number {
  // Run from frontend/ (npm run) or repo root (CI)
  const fromCwd = path.join(process.cwd(), "docs", "RESEARCH_GUIDANCE.md");
  const fromParent = path.join(process.cwd(), "..", "docs", "RESEARCH_GUIDANCE.md");
  const GUIDANCE_PATH = fs.existsSync(fromCwd) ? fromCwd : fromParent;

  if (!fs.existsSync(GUIDANCE_PATH)) {
    console.error(`Missing RESEARCH_GUIDANCE.md at ${GUIDANCE_PATH}`);
    return 1;
  }
  const markdown = fs.readFileSync(GUIDANCE_PATH, "utf-8");
  const spec = parseResearchGuidance(markdown);
  const result = validateResearchGuidance(spec);

  if (result.warnings.length > 0) {
    result.warnings.forEach((w) => console.warn("Warning:", w));
  }
  if (result.errors.length > 0) {
    result.errors.forEach((e) => console.error("Error:", e));
    return 1;
  }
  console.log(
    `OK: RESEARCH_GUIDANCE.md valid (${spec.params.length} params, ${spec.gatingRules.length} gating rules)`
  );
  return 0;
}

process.exit(main());
