/**
 * Tests for RESEARCH_GUIDANCE loader and validator.
 * ParamSpec can be imported by UI, migration, mapping; validator fails on violations.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { parseResearchGuidance } from "../researchGuidanceLoader";
import { validateResearchGuidance } from "../validateResearchGuidance";
import type { ResearchParamSpec, ResearchParamRecord } from "../researchGuidanceTypes";

const GUIDANCE_PATH = path.resolve(
  process.cwd(),
  process.cwd().endsWith("frontend") ? "../docs/RESEARCH_GUIDANCE.md" : "docs/RESEARCH_GUIDANCE.md"
);

describe("Research guidance loader + validator", () => {
  it("parses RESEARCH_GUIDANCE.md and produces ParamSpec", () => {
    if (!fs.existsSync(GUIDANCE_PATH)) {
      console.warn("RESEARCH_GUIDANCE.md not found at", GUIDANCE_PATH);
      return;
    }
    const markdown = fs.readFileSync(GUIDANCE_PATH, "utf-8");
    const spec = parseResearchGuidance(markdown);
    expect(spec.schemaVersion).toBe(1);
    expect(spec.params.length).toBeGreaterThan(0);
    expect(Array.isArray(spec.gatingRules)).toBe(true);
    expect(Array.isArray(spec.deprecated)).toBe(true);
  });

  it("validates parsed spec with no errors", () => {
    if (!fs.existsSync(GUIDANCE_PATH)) return;
    const markdown = fs.readFileSync(GUIDANCE_PATH, "utf-8");
    const spec = parseResearchGuidance(markdown);
    const result = validateResearchGuidance(spec);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails on duplicate ids", () => {
    const spec: ResearchParamSpec = {
      schemaVersion: 1,
      params: [
        { id: "dup", label: "A", unit: "ms", min: 0, max: 10, default: 5, role: "body" },
        { id: "dup", label: "B", unit: "ms", min: 0, max: 10, default: 5, role: "body" },
      ],
      gatingRules: [],
      deprecated: [],
    };
    const result = validateResearchGuidance(spec);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("fails on invalid unit", () => {
    const spec: ResearchParamSpec = {
      schemaVersion: 1,
      params: [
        {
          id: "x",
          label: "X",
          unit: "invalid_unit" as any,
          min: 0,
          max: 1,
          default: 0.5,
          role: "body",
        },
      ],
      gatingRules: [],
      deprecated: [],
    };
    const result = validateResearchGuidance(spec);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("invalid unit"))).toBe(true);
  });

  it("fails when default out of range", () => {
    const spec: ResearchParamSpec = {
      schemaVersion: 1,
      params: [
        {
          id: "x",
          label: "X",
          unit: "ms",
          min: 0,
          max: 100,
          default: 200,
          role: "body",
        },
      ],
      gatingRules: [],
      deprecated: [],
    };
    const result = validateResearchGuidance(spec);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("out of range"))).toBe(true);
  });

  it("fails on missing required field", () => {
    const spec: ResearchParamSpec = {
      schemaVersion: 1,
      params: [
        {
          id: "x",
          label: "X",
          unit: "ms",
          min: 0,
          max: 100,
          default: 50,
          role: "body",
        },
      ],
      gatingRules: [],
      deprecated: [],
    };
    delete (spec.params[0] as Partial<ResearchParamRecord>).unit;
    const result = validateResearchGuidance(spec);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("missing required"))).toBe(true);
  });
});
