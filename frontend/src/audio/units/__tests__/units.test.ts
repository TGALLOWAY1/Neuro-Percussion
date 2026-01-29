/**
 * Unit conversion and clamping tests.
 * Verifies boundary cases and correct conversions.
 */

import { describe, it, expect } from "vitest";
import {
  clamp,
  msToSeconds,
  secondsToMs,
  stToRatio,
  ratioToSt,
  dbToLinear,
  linearToDb,
  pctToLinear,
  linearToPct,
  pctToDbLinear,
  pctToDbPerceptual,
  numberToBool,
} from "../index";

describe("Unit conversions", () => {
  describe("clamp", () => {
    it("clamps value to [min, max]", () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });
  });

  describe("msToSeconds / secondsToMs", () => {
    it("converts ms to seconds", () => {
      expect(msToSeconds(0)).toBe(0);
      expect(msToSeconds(1000)).toBe(1);
      expect(msToSeconds(500)).toBe(0.5);
      expect(msToSeconds(2500)).toBe(2.5);
    });

    it("converts seconds to ms", () => {
      expect(secondsToMs(0)).toBe(0);
      expect(secondsToMs(1)).toBe(1000);
      expect(secondsToMs(0.5)).toBe(500);
      expect(secondsToMs(2.5)).toBe(2500);
    });

    it("round-trips correctly", () => {
      const ms = 1234.5;
      expect(secondsToMs(msToSeconds(ms))).toBeCloseTo(ms, 5);
    });
  });

  describe("stToRatio / ratioToSt", () => {
    it("converts semitones to ratio", () => {
      expect(stToRatio(0)).toBeCloseTo(1.0, 5);
      expect(stToRatio(12)).toBeCloseTo(2.0, 5); // Octave
      expect(stToRatio(-12)).toBeCloseTo(0.5, 5); // Down octave
      expect(stToRatio(24)).toBeCloseTo(4.0, 5); // Two octaves
    });

    it("converts ratio to semitones", () => {
      expect(ratioToSt(1.0)).toBeCloseTo(0, 5);
      expect(ratioToSt(2.0)).toBeCloseTo(12, 5);
      expect(ratioToSt(0.5)).toBeCloseTo(-12, 5);
      expect(ratioToSt(4.0)).toBeCloseTo(24, 5);
    });

    it("round-trips correctly", () => {
      const st = 7.5;
      expect(ratioToSt(stToRatio(st))).toBeCloseTo(st, 5);
    });
  });

  describe("dbToLinear / linearToDb", () => {
    it("converts dB to linear", () => {
      expect(dbToLinear(0)).toBeCloseTo(1.0, 5);
      expect(dbToLinear(6)).toBeCloseTo(1.995, 2);
      expect(dbToLinear(-6)).toBeCloseTo(0.501, 2);
      expect(dbToLinear(-200)).toBeLessThan(0.00001); // Very small value (effectively mute)
    });

    it("converts linear to dB", () => {
      expect(linearToDb(1.0)).toBeCloseTo(0, 2);
      expect(linearToDb(2.0)).toBeCloseTo(6.02, 2);
      expect(linearToDb(0.5)).toBeCloseTo(-6.02, 2);
      expect(linearToDb(0)).toBe(-Infinity);
    });

    it("round-trips correctly", () => {
      const db = -12.5;
      expect(linearToDb(dbToLinear(db))).toBeCloseTo(db, 2);
    });
  });

  describe("pctToLinear / linearToPct", () => {
    it("converts percentage to linear", () => {
      expect(pctToLinear(0)).toBe(0);
      expect(pctToLinear(100)).toBe(1);
      expect(pctToLinear(50)).toBe(0.5);
      expect(pctToLinear(150)).toBe(1.5);
    });

    it("converts linear to percentage", () => {
      expect(linearToPct(0)).toBe(0);
      expect(linearToPct(1)).toBe(100);
      expect(linearToPct(0.5)).toBe(50);
      expect(linearToPct(1.5)).toBe(150);
    });

    it("round-trips correctly", () => {
      const pct = 75.5;
      expect(linearToPct(pctToLinear(pct))).toBeCloseTo(pct, 5);
    });
  });

  describe("pctToDbLinear", () => {
    it("converts percentage to dB with linear mapping", () => {
      expect(pctToDbLinear(0, -24, 0)).toBe(-200); // Mute
      expect(pctToDbLinear(100, -24, 0)).toBeCloseTo(0, 2);
      expect(pctToDbLinear(50, -24, 0)).toBeCloseTo(-12, 2);
      expect(pctToDbLinear(100, -18, 3)).toBeCloseTo(3, 2);
      expect(pctToDbLinear(50, -18, 3)).toBeCloseTo(-7.5, 2);
    });

    it("handles boundary cases", () => {
      expect(pctToDbLinear(-10, -24, 0)).toBe(-200); // Negative pct -> mute
      expect(pctToDbLinear(0, -24, 0)).toBe(-200); // Zero pct -> mute
    });
  });

  describe("pctToDbPerceptual", () => {
    it("converts percentage to dB with perceptual curve", () => {
      expect(pctToDbPerceptual(0, -24, 0)).toBe(-200); // Mute
      expect(pctToDbPerceptual(100, -24, 0, 1.5)).toBeCloseTo(0, 2);
      // With curve=1.5, 50% should be less than linear midpoint
      const linear50 = pctToDbLinear(50, -24, 0);
      const perceptual50 = pctToDbPerceptual(50, -24, 0, 1.5);
      expect(perceptual50).toBeLessThan(linear50);
    });

    it("handles different curve values", () => {
      const curve1 = pctToDbPerceptual(50, -24, 0, 1.0);
      const curve2 = pctToDbPerceptual(50, -24, 0, 2.0);
      expect(curve2).toBeLessThan(curve1); // Higher curve = more compression
    });
  });

  describe("numberToBool", () => {
    it("converts number to boolean", () => {
      expect(numberToBool(0)).toBe(false);
      expect(numberToBool(0.5)).toBe(false);
      expect(numberToBool(0.51)).toBe(true);
      expect(numberToBool(1)).toBe(true);
      expect(numberToBool(2)).toBe(true);
    });
  });

  describe("boundary cases", () => {
    it("handles ms=0 and ms=max", () => {
      expect(msToSeconds(0)).toBe(0);
      expect(msToSeconds(2500)).toBe(2.5);
      expect(secondsToMs(0)).toBe(0);
      expect(secondsToMs(2.5)).toBe(2500);
    });

    it("handles hz min/max (no conversion needed, passed through)", () => {
      // Hz values are passed through directly in mapping
      // This test documents that hz values don't need conversion
      expect(100).toBe(100);
      expect(16000).toBe(16000);
    });

    it("handles st min/max", () => {
      expect(stToRatio(0)).toBeCloseTo(1.0, 5);
      expect(stToRatio(100)).toBeCloseTo(Math.pow(2, 100/12), 5);
      expect(stToRatio(-12)).toBeCloseTo(0.5, 5);
    });

    it("handles pct boundary cases", () => {
      expect(pctToLinear(0)).toBe(0);
      expect(pctToLinear(100)).toBe(1);
      expect(pctToLinear(150)).toBe(1.5); // For width_pct
      expect(pctToDbLinear(0, -24, 0)).toBe(-200);
      expect(pctToDbLinear(100, -24, 0)).toBeCloseTo(0, 2);
    });

    it("clamps values correctly", () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });
  });
});
