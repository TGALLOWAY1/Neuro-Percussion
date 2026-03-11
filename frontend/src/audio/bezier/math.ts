/**
 * Bezier curve math utilities.
 * Cubic Bezier evaluation, subdivision, and envelope↔params conversion.
 */

import type { Point, BezierNode, BezierEnvelope } from "./types";

/**
 * Evaluate a cubic Bezier curve at parameter t ∈ [0, 1].
 * P(t) = (1-t)³·P0 + 3(1-t)²t·P1 + 3(1-t)t²·P2 + t³·P3
 */
export function cubicBezier(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number
): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
  };
}

/**
 * Sample a cubic Bezier segment into an array of points for rendering.
 */
export function sampleBezierSegment(
  p0: Point,
  cp1: Point,  // absolute control point (p0 outgoing)
  cp2: Point,  // absolute control point (p1 incoming)
  p1: Point,
  steps: number = 32
): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    points.push(cubicBezier(p0, cp1, cp2, p1, i / steps));
  }
  return points;
}

/**
 * Get absolute control points from a BezierNode.
 */
export function getAbsoluteControlOut(node: BezierNode): Point {
  return {
    x: node.position.x + node.controlOut.x,
    y: node.position.y + node.controlOut.y,
  };
}

export function getAbsoluteControlIn(node: BezierNode): Point {
  return {
    x: node.position.x + node.controlIn.x,
    y: node.position.y + node.controlIn.y,
  };
}

/**
 * Sample the entire Bezier envelope into points for rendering.
 * Returns points in normalized space: x ∈ [0, 1] (time), y ∈ [0, 1] (amplitude).
 */
export function sampleEnvelope(
  envelope: BezierEnvelope,
  stepsPerSegment: number = 48
): Point[] {
  const { nodes } = envelope;
  if (nodes.length < 2) return [];

  const allPoints: Point[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const n0 = nodes[i];
    const n1 = nodes[i + 1];
    const cp1 = getAbsoluteControlOut(n0);
    const cp2 = getAbsoluteControlIn(n1);
    const segPoints = sampleBezierSegment(n0.position, cp1, cp2, n1.position, stepsPerSegment);
    // Avoid duplicating shared endpoints
    if (i > 0) segPoints.shift();
    allPoints.push(...segPoints);
  }
  return allPoints;
}

/**
 * Distance between two points.
 */
export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Create a default AD envelope (Attack-Decay).
 * x: normalized time [0, 1], y: normalized amplitude [0, 1]
 * attackRatio: fraction of total time for attack phase
 * curveAmount: curvature of the decay (higher = more exponential)
 */
export function createADEnvelope(
  attackRatio: number = 0.05,
  curveAmount: number = 0.4
): BezierEnvelope {
  const peakX = Math.max(0.01, Math.min(0.5, attackRatio));

  return {
    nodes: [
      {
        position: { x: 0, y: 0 },
        controlIn: { x: 0, y: 0 },
        controlOut: { x: peakX * 0.5, y: 0 },
        locked: true,
      },
      {
        position: { x: peakX, y: 1 },
        controlIn: { x: -peakX * 0.3, y: 0 },
        controlOut: { x: (1 - peakX) * curveAmount, y: 0 },
      },
      {
        position: { x: 1, y: 0 },
        controlIn: { x: -(1 - peakX) * 0.1, y: 0 },
        controlOut: { x: 0, y: 0 },
        locked: true,
      },
    ],
  };
}

/**
 * Create a default AHD envelope (Attack-Hold-Decay).
 * attackRatio, holdRatio: fractions of total time
 */
export function createAHDEnvelope(
  attackRatio: number = 0.02,
  holdRatio: number = 0.05,
  curveAmount: number = 0.4
): BezierEnvelope {
  const peakX = Math.max(0.01, attackRatio);
  const holdEndX = Math.min(0.5, peakX + holdRatio);
  const decayLen = 1 - holdEndX;

  return {
    nodes: [
      {
        position: { x: 0, y: 0 },
        controlIn: { x: 0, y: 0 },
        controlOut: { x: peakX * 0.5, y: 0 },
        locked: true,
      },
      {
        position: { x: peakX, y: 1 },
        controlIn: { x: -peakX * 0.3, y: 0 },
        controlOut: { x: (holdEndX - peakX) * 0.1, y: 0 },
      },
      {
        position: { x: holdEndX, y: 1 },
        controlIn: { x: -(holdEndX - peakX) * 0.1, y: 0 },
        controlOut: { x: decayLen * curveAmount, y: 0 },
      },
      {
        position: { x: 1, y: 0 },
        controlIn: { x: -decayLen * 0.1, y: 0 },
        controlOut: { x: 0, y: 0 },
        locked: true,
      },
    ],
  };
}

/**
 * Convert envelope params (attack_ms, hold_ms, decay_ms, curve) into a BezierEnvelope.
 * Maps time-domain params into normalized [0,1] space.
 */
export function paramsToEnvelope(
  mode: "AD" | "AHD",
  values: Record<string, number>,
  paramIds: {
    attack: string;
    decay: string;
    hold?: string;
    curve?: string;
  }
): BezierEnvelope {
  const attackMs = values[paramIds.attack] ?? 1;
  const decayMs = values[paramIds.decay] ?? 220;
  const holdMs = paramIds.hold ? (values[paramIds.hold] ?? 0) : 0;
  const curveVal = paramIds.curve ? (values[paramIds.curve] ?? 1.5) : 1.5;

  const totalMs = attackMs + holdMs + decayMs;
  if (totalMs <= 0) {
    return mode === "AHD" ? createAHDEnvelope() : createADEnvelope();
  }

  const attackRatio = attackMs / totalMs;
  const holdRatio = holdMs / totalMs;

  // Map curve value (0.2-3.0) to curvature amount (0.1-0.8)
  const curveAmount = 0.1 + (curveVal / 3.0) * 0.7;

  if (mode === "AHD") {
    return createAHDEnvelope(attackRatio, holdRatio, curveAmount);
  }
  return createADEnvelope(attackRatio, curveAmount);
}

/**
 * Convert a BezierEnvelope back to envelope params.
 * Maps normalized [0,1] positions back to time-domain ms values.
 */
export function envelopeToParams(
  envelope: BezierEnvelope,
  mode: "AD" | "AHD",
  totalDurationMs: number,
  paramIds: {
    attack: string;
    decay: string;
    hold?: string;
    curve?: string;
  }
): Record<string, number> {
  const { nodes } = envelope;
  const result: Record<string, number> = {};

  if (mode === "AD" && nodes.length >= 3) {
    const peakX = nodes[1].position.x;
    result[paramIds.attack] = peakX * totalDurationMs;
    result[paramIds.decay] = (1 - peakX) * totalDurationMs;
  } else if (mode === "AHD" && nodes.length >= 4) {
    const attackX = nodes[1].position.x;
    const holdEndX = nodes[2].position.x;
    result[paramIds.attack] = attackX * totalDurationMs;
    if (paramIds.hold) {
      result[paramIds.hold] = (holdEndX - attackX) * totalDurationMs;
    }
    result[paramIds.decay] = (1 - holdEndX) * totalDurationMs;
  }

  return result;
}

/**
 * Clamp a node's position within valid bounds.
 * prevX/nextX: x bounds from neighboring nodes.
 */
export function clampNodePosition(
  pos: Point,
  prevX: number,
  nextX: number
): Point {
  return {
    x: Math.max(prevX + 0.005, Math.min(nextX - 0.005, pos.x)),
    y: Math.max(0, Math.min(1, pos.y)),
  };
}
