/**
 * Bezier envelope types for the visual editor.
 * A BezierEnvelope is a series of nodes connected by cubic Bezier curves.
 */

/** 2D point */
export interface Point {
  x: number;
  y: number;
}

/**
 * A node in the Bezier envelope.
 * - position: the node's anchor point (time, amplitude)
 * - controlIn: control handle relative to position (for incoming curve)
 * - controlOut: control handle relative to position (for outgoing curve)
 */
export interface BezierNode {
  position: Point;
  controlIn: Point;   // relative offset from position
  controlOut: Point;   // relative offset from position
  locked?: boolean;    // if true, node can't be moved (start/end)
}

/**
 * Complete Bezier envelope for one envelope type (AMP or PITCH).
 * Nodes are ordered by ascending x (time).
 */
export interface BezierEnvelope {
  nodes: BezierNode[];
}

/** Which part of a node is being interacted with */
export type DragTarget =
  | { type: "node"; index: number }
  | { type: "controlIn"; index: number }
  | { type: "controlOut"; index: number }
  | null;
