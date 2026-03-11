/**
 * Tests for Bezier math utilities — curve evaluation, envelope generation,
 * and bidirectional params↔envelope conversion.
 */

import { describe, it, expect } from "vitest";
import {
  cubicBezier,
  sampleBezierSegment,
  sampleEnvelope,
  createADEnvelope,
  createAHDEnvelope,
  paramsToEnvelope,
  envelopeToParams,
  clampNodePosition,
  distance,
} from "../math";
import type { BezierEnvelope } from "../types";

describe("cubicBezier", () => {
  it("returns p0 at t=0", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0.3, y: 1 };
    const p2 = { x: 0.7, y: 1 };
    const p3 = { x: 1, y: 0 };
    const result = cubicBezier(p0, p1, p2, p3, 0);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
  });

  it("returns p3 at t=1", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0.3, y: 1 };
    const p2 = { x: 0.7, y: 1 };
    const p3 = { x: 1, y: 0 };
    const result = cubicBezier(p0, p1, p2, p3, 1);
    expect(result.x).toBeCloseTo(1);
    expect(result.y).toBeCloseTo(0);
  });

  it("returns midpoint at t=0.5 for symmetric curve", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0, y: 1 };
    const p2 = { x: 1, y: 1 };
    const p3 = { x: 1, y: 0 };
    const result = cubicBezier(p0, p1, p2, p3, 0.5);
    expect(result.x).toBeCloseTo(0.5);
    expect(result.y).toBeCloseTo(0.75);
  });

  it("linear curve when control points on line", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0.33, y: 0.33 };
    const p2 = { x: 0.67, y: 0.67 };
    const p3 = { x: 1, y: 1 };
    const result = cubicBezier(p0, p1, p2, p3, 0.5);
    expect(result.x).toBeCloseTo(0.5);
    expect(result.y).toBeCloseTo(0.5);
  });
});

describe("sampleBezierSegment", () => {
  it("returns correct number of points", () => {
    const points = sampleBezierSegment(
      { x: 0, y: 0 },
      { x: 0.3, y: 1 },
      { x: 0.7, y: 1 },
      { x: 1, y: 0 },
      10
    );
    expect(points).toHaveLength(11); // 0..10 inclusive
  });

  it("first and last points match endpoints", () => {
    const points = sampleBezierSegment(
      { x: 0, y: 0.5 },
      { x: 0.3, y: 1 },
      { x: 0.7, y: 1 },
      { x: 1, y: 0.2 },
      20
    );
    expect(points[0].x).toBeCloseTo(0);
    expect(points[0].y).toBeCloseTo(0.5);
    expect(points[20].x).toBeCloseTo(1);
    expect(points[20].y).toBeCloseTo(0.2);
  });
});

describe("createADEnvelope", () => {
  it("creates 3 nodes (start, peak, end)", () => {
    const env = createADEnvelope(0.1);
    expect(env.nodes).toHaveLength(3);
  });

  it("start at (0,0) and end at (1,0)", () => {
    const env = createADEnvelope(0.1);
    expect(env.nodes[0].position).toEqual({ x: 0, y: 0 });
    expect(env.nodes[2].position).toEqual({ x: 1, y: 0 });
  });

  it("peak at correct x position", () => {
    const env = createADEnvelope(0.2);
    expect(env.nodes[1].position.x).toBeCloseTo(0.2);
    expect(env.nodes[1].position.y).toBe(1);
  });

  it("start and end nodes are locked", () => {
    const env = createADEnvelope();
    expect(env.nodes[0].locked).toBe(true);
    expect(env.nodes[2].locked).toBe(true);
  });
});

describe("createAHDEnvelope", () => {
  it("creates 4 nodes (start, peak, holdEnd, end)", () => {
    const env = createAHDEnvelope(0.05, 0.1);
    expect(env.nodes).toHaveLength(4);
  });

  it("hold section is flat at y=1", () => {
    const env = createAHDEnvelope(0.05, 0.1);
    expect(env.nodes[1].position.y).toBe(1);
    expect(env.nodes[2].position.y).toBe(1);
  });

  it("hold end x = attack + hold ratio", () => {
    const env = createAHDEnvelope(0.1, 0.2);
    expect(env.nodes[2].position.x).toBeCloseTo(0.3);
  });
});

describe("sampleEnvelope", () => {
  it("returns empty for < 2 nodes", () => {
    expect(sampleEnvelope({ nodes: [] })).toEqual([]);
    expect(sampleEnvelope({ nodes: [{ position: { x: 0, y: 0 }, controlIn: { x: 0, y: 0 }, controlOut: { x: 0, y: 0 } }] })).toEqual([]);
  });

  it("returns points for AD envelope", () => {
    const env = createADEnvelope(0.1);
    const points = sampleEnvelope(env, 16);
    expect(points.length).toBeGreaterThan(16);
    // First point starts at x=0
    expect(points[0].x).toBeCloseTo(0);
    // Last point ends at x=1
    expect(points[points.length - 1].x).toBeCloseTo(1);
  });

  it("all y values are in [0, 1] range for well-formed envelopes", () => {
    const env = createADEnvelope(0.15);
    const points = sampleEnvelope(env, 32);
    for (const p of points) {
      expect(p.y).toBeGreaterThanOrEqual(-0.01);
      expect(p.y).toBeLessThanOrEqual(1.01);
    }
  });
});

describe("paramsToEnvelope", () => {
  const adParamIds = { attack: "attack_ms", decay: "decay_ms", curve: "curve" };

  it("creates AD envelope from kick-like params", () => {
    const values = { attack_ms: 1, decay_ms: 220, curve: 1.6 };
    const env = paramsToEnvelope("AD", values, adParamIds);
    expect(env.nodes).toHaveLength(3);
    expect(env.nodes[0].position.x).toBeCloseTo(0);
    expect(env.nodes[1].position.y).toBe(1);
    expect(env.nodes[2].position.x).toBeCloseTo(1);
  });

  it("attack ratio scales with attack/total time", () => {
    const env1 = paramsToEnvelope("AD", { attack_ms: 10, decay_ms: 90 }, adParamIds);
    const env2 = paramsToEnvelope("AD", { attack_ms: 50, decay_ms: 50 }, adParamIds);
    expect(env1.nodes[1].position.x).toBeCloseTo(0.1);
    expect(env2.nodes[1].position.x).toBeCloseTo(0.5);
  });

  it("creates AHD envelope from kick-like params", () => {
    const ahdParamIds = { attack: "attack_ms", decay: "decay_ms", hold: "hold_ms", curve: "curve" };
    const values = { attack_ms: 1, hold_ms: 5, decay_ms: 220, curve: 1.6 };
    const env = paramsToEnvelope("AHD", values, ahdParamIds);
    expect(env.nodes).toHaveLength(4);
    // Hold segment: nodes[1] and nodes[2] both at y=1
    expect(env.nodes[1].position.y).toBe(1);
    expect(env.nodes[2].position.y).toBe(1);
  });
});

describe("envelopeToParams", () => {
  it("round-trips AD params through envelope conversion", () => {
    const paramIds = { attack: "attack_ms", decay: "decay_ms" };
    // Use values where attackRatio > 0.01 clamp (10/200 = 0.05)
    const origValues = { attack_ms: 10, decay_ms: 190 };
    const totalMs = 200;

    const env = paramsToEnvelope("AD", origValues, paramIds);
    const result = envelopeToParams(env, "AD", totalMs, paramIds);

    expect(result.attack_ms).toBeCloseTo(10, 0);
    expect(result.decay_ms).toBeCloseTo(190, 0);
  });

  it("round-trips AHD params through envelope conversion", () => {
    const paramIds = { attack: "attack_ms", decay: "decay_ms", hold: "hold_ms" };
    // Use values where attackRatio > 0.01 clamp (20/300 ≈ 0.067)
    const origValues = { attack_ms: 20, hold_ms: 30, decay_ms: 250 };
    const totalMs = 300;

    const env = paramsToEnvelope("AHD", origValues, paramIds);
    const result = envelopeToParams(env, "AHD", totalMs, paramIds);

    expect(result.attack_ms).toBeCloseTo(20, 0);
    expect(result.hold_ms).toBeCloseTo(30, 0);
    expect(result.decay_ms).toBeCloseTo(250, 0);
  });
});

describe("clampNodePosition", () => {
  it("clamps x between prev and next", () => {
    const result = clampNodePosition({ x: 0.8, y: 0.5 }, 0.2, 0.6);
    expect(result.x).toBeLessThan(0.6);
  });

  it("clamps y to [0, 1]", () => {
    const result = clampNodePosition({ x: 0.5, y: 1.5 }, 0, 1);
    expect(result.y).toBe(1);
    const result2 = clampNodePosition({ x: 0.5, y: -0.5 }, 0, 1);
    expect(result2.y).toBe(0);
  });
});

describe("distance", () => {
  it("calculates Euclidean distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
    expect(distance({ x: 1, y: 1 }, { x: 1, y: 1 })).toBeCloseTo(0);
  });
});
