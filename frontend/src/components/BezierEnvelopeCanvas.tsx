/**
 * BezierEnvelopeCanvas — Canvas2D interactive Bezier envelope editor.
 * Renders waveform underneath with draggable envelope curve overlay.
 * Phase 2 critical path component.
 */

"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import type { BezierEnvelope, BezierNode, DragTarget, Point } from "@/audio/bezier";
import {
  sampleEnvelope,
  getAbsoluteControlIn,
  getAbsoluteControlOut,
  distance,
  clampNodePosition,
} from "@/audio/bezier";

// ── Constants ────────────────────────────────────────────────────
const NODE_RADIUS = 6;
const CONTROL_RADIUS = 4;
const HIT_RADIUS = 12;
const PADDING = { top: 16, right: 16, bottom: 16, left: 16 };
const COLORS = {
  waveform: "rgb(16, 185, 129)",        // emerald-500
  waveformAlpha: "rgba(16, 185, 129, 0.3)",
  curve: "rgb(250, 204, 21)",            // yellow-400
  curveGlow: "rgba(250, 204, 21, 0.15)",
  node: "rgb(250, 204, 21)",
  nodeActive: "rgb(255, 255, 255)",
  controlHandle: "rgba(250, 204, 21, 0.6)",
  controlLine: "rgba(250, 204, 21, 0.25)",
  grid: "rgba(255, 255, 255, 0.04)",
  gridLabel: "rgba(255, 255, 255, 0.15)",
  background: "rgb(23, 23, 23)",
};

interface BezierEnvelopeCanvasProps {
  audioBuffer: AudioBuffer | null;
  envelope: BezierEnvelope;
  onEnvelopeChange: (envelope: BezierEnvelope) => void;
  height?: number;
  mode?: "AMP" | "PITCH";
}

export const BezierEnvelopeCanvas: React.FC<BezierEnvelopeCanvasProps> = ({
  audioBuffer,
  envelope,
  onEnvelopeChange,
  height = 256,
  mode = "AMP",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [hoveredTarget, setHoveredTarget] = useState<DragTarget>(null);
  const envelopeRef = useRef(envelope);
  envelopeRef.current = envelope;

  // ── Coordinate conversion ────────────────────────────────
  const toCanvas = useCallback(
    (p: Point, w: number, h: number): Point => ({
      x: PADDING.left + p.x * (w - PADDING.left - PADDING.right),
      y: PADDING.top + (1 - p.y) * (h - PADDING.top - PADDING.bottom),
    }),
    []
  );

  const fromCanvas = useCallback(
    (cx: number, cy: number, w: number, h: number): Point => ({
      x: (cx - PADDING.left) / (w - PADDING.left - PADDING.right),
      y: 1 - (cy - PADDING.top) / (h - PADDING.top - PADDING.bottom),
    }),
    []
  );

  // ── Drawing ──────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    drawGrid(ctx, w, h);

    // Waveform (underneath)
    if (audioBuffer) {
      drawWaveform(ctx, audioBuffer, w, h);
    }

    // Envelope curve fill (subtle)
    const env = envelopeRef.current;
    if (env.nodes.length >= 2) {
      drawEnvelopeFill(ctx, env, w, h);
      drawEnvelopeCurve(ctx, env, w, h);
      drawControlHandles(ctx, env, w, h);
      drawNodes(ctx, env, w, h);
    }
  }, [audioBuffer, toCanvas]);

  // Trigger redraw when envelope changes
  useEffect(() => {
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(draw);
  }, [draw, envelope]);

  // ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(draw);
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [draw]);

  // ── Draw helpers ─────────────────────────────────────────
  function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;

    // Horizontal grid lines at 25%, 50%, 75%
    for (const frac of [0.25, 0.5, 0.75]) {
      const y = PADDING.top + frac * (h - PADDING.top - PADDING.bottom);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(w - PADDING.right, y);
      ctx.stroke();
    }

    // Vertical grid lines
    for (const frac of [0.25, 0.5, 0.75]) {
      const x = PADDING.left + frac * (w - PADDING.left - PADDING.right);
      ctx.beginPath();
      ctx.moveTo(x, PADDING.top);
      ctx.lineTo(x, h - PADDING.bottom);
      ctx.stroke();
    }

    // Labels
    ctx.fillStyle = COLORS.gridLabel;
    ctx.font = "9px monospace";
    ctx.textAlign = "right";
    ctx.fillText("100%", PADDING.left - 4, PADDING.top + 4);
    ctx.fillText("50%", PADDING.left - 4, PADDING.top + (h - PADDING.top - PADDING.bottom) * 0.5 + 3);
    ctx.fillText("0%", PADDING.left - 4, h - PADDING.bottom + 3);
  }

  function drawWaveform(
    ctx: CanvasRenderingContext2D,
    buffer: AudioBuffer,
    w: number,
    h: number
  ) {
    const channelData = buffer.getChannelData(0);
    const samples = channelData.length;
    const drawW = w - PADDING.left - PADDING.right;
    const drawH = h - PADDING.top - PADDING.bottom;
    const samplesPerPixel = Math.max(1, Math.floor(samples / drawW));
    const midY = PADDING.top + drawH / 2;

    ctx.strokeStyle = COLORS.waveformAlpha;
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 0; x < drawW; x++) {
      const start = x * samplesPerPixel;
      const end = Math.min(start + samplesPerPixel, samples);
      let min = 0;
      let max = 0;
      for (let i = start; i < end; i++) {
        const val = channelData[i];
        if (val < min) min = val;
        if (val > max) max = val;
      }
      const yMin = midY - max * (drawH / 2);
      const yMax = midY - min * (drawH / 2);
      ctx.moveTo(PADDING.left + x, yMin);
      ctx.lineTo(PADDING.left + x, yMax);
    }
    ctx.stroke();
  }

  function drawEnvelopeFill(
    ctx: CanvasRenderingContext2D,
    env: BezierEnvelope,
    w: number,
    h: number
  ) {
    const points = sampleEnvelope(env, 64);
    if (points.length < 2) return;

    ctx.beginPath();
    const first = toCanvas(points[0], w, h);
    ctx.moveTo(first.x, h - PADDING.bottom);
    ctx.lineTo(first.x, first.y);

    for (let i = 1; i < points.length; i++) {
      const p = toCanvas(points[i], w, h);
      ctx.lineTo(p.x, p.y);
    }

    const last = toCanvas(points[points.length - 1], w, h);
    ctx.lineTo(last.x, h - PADDING.bottom);
    ctx.closePath();

    ctx.fillStyle = COLORS.curveGlow;
    ctx.fill();
  }

  function drawEnvelopeCurve(
    ctx: CanvasRenderingContext2D,
    env: BezierEnvelope,
    w: number,
    h: number
  ) {
    const points = sampleEnvelope(env, 64);
    if (points.length < 2) return;

    ctx.beginPath();
    const first = toCanvas(points[0], w, h);
    ctx.moveTo(first.x, first.y);

    for (let i = 1; i < points.length; i++) {
      const p = toCanvas(points[i], w, h);
      ctx.lineTo(p.x, p.y);
    }

    ctx.strokeStyle = COLORS.curve;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawControlHandles(
    ctx: CanvasRenderingContext2D,
    env: BezierEnvelope,
    w: number,
    h: number
  ) {
    for (let i = 0; i < env.nodes.length; i++) {
      const node = env.nodes[i];
      const pos = toCanvas(node.position, w, h);

      // Draw control-in handle (not for first node)
      if (i > 0) {
        const cpIn = toCanvas(getAbsoluteControlIn(node), w, h);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(cpIn.x, cpIn.y);
        ctx.strokeStyle = COLORS.controlLine;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cpIn.x, cpIn.y, CONTROL_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.controlHandle;
        ctx.fill();
      }

      // Draw control-out handle (not for last node)
      if (i < env.nodes.length - 1) {
        const cpOut = toCanvas(getAbsoluteControlOut(node), w, h);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(cpOut.x, cpOut.y);
        ctx.strokeStyle = COLORS.controlLine;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cpOut.x, cpOut.y, CONTROL_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.controlHandle;
        ctx.fill();
      }
    }
  }

  function drawNodes(
    ctx: CanvasRenderingContext2D,
    env: BezierEnvelope,
    w: number,
    h: number
  ) {
    for (let i = 0; i < env.nodes.length; i++) {
      const node = env.nodes[i];
      const pos = toCanvas(node.position, w, h);
      const isHovered =
        hoveredTarget?.type === "node" && hoveredTarget.index === i;
      const isDragged =
        dragTarget?.type === "node" && dragTarget.index === i;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, NODE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle =
        isDragged || isHovered ? COLORS.nodeActive : COLORS.node;
      ctx.fill();

      if (isDragged || isHovered) {
        ctx.strokeStyle = COLORS.curve;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  // ── Hit testing ──────────────────────────────────────────
  function hitTest(
    mouseX: number,
    mouseY: number,
    w: number,
    h: number
  ): DragTarget {
    const env = envelopeRef.current;

    // Test nodes first (highest priority)
    for (let i = 0; i < env.nodes.length; i++) {
      const pos = toCanvas(env.nodes[i].position, w, h);
      if (distance({ x: mouseX, y: mouseY }, pos) < HIT_RADIUS) {
        return { type: "node", index: i };
      }
    }

    // Test control handles
    for (let i = 0; i < env.nodes.length; i++) {
      const node = env.nodes[i];

      if (i > 0) {
        const cpIn = toCanvas(getAbsoluteControlIn(node), w, h);
        if (distance({ x: mouseX, y: mouseY }, cpIn) < HIT_RADIUS) {
          return { type: "controlIn", index: i };
        }
      }

      if (i < env.nodes.length - 1) {
        const cpOut = toCanvas(getAbsoluteControlOut(node), w, h);
        if (distance({ x: mouseX, y: mouseY }, cpOut) < HIT_RADIUS) {
          return { type: "controlOut", index: i };
        }
      }
    }

    return null;
  }

  // ── Mouse handlers ───────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      const target = hitTest(mx, my, w, h);

      if (target) {
        // Don't allow dragging locked nodes (start/end x position)
        setDragTarget(target);
        e.preventDefault();
      }
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      if (dragTarget) {
        // Dragging
        const env = envelopeRef.current;
        const normalized = fromCanvas(mx, my, w, h);
        const newEnv = structuredClone(env);
        const { nodes } = newEnv;
        const idx = dragTarget.index;

        if (dragTarget.type === "node") {
          const node = nodes[idx];
          if (node.locked) {
            // Locked nodes: only allow Y movement
            node.position.y = Math.max(0, Math.min(1, normalized.y));
          } else {
            const prevX = idx > 0 ? nodes[idx - 1].position.x : 0;
            const nextX =
              idx < nodes.length - 1 ? nodes[idx + 1].position.x : 1;
            node.position = clampNodePosition(normalized, prevX, nextX);
          }
        } else if (dragTarget.type === "controlIn") {
          const node = nodes[idx];
          nodes[idx] = {
            ...node,
            controlIn: {
              x: normalized.x - node.position.x,
              y: normalized.y - node.position.y,
            },
          };
        } else if (dragTarget.type === "controlOut") {
          const node = nodes[idx];
          nodes[idx] = {
            ...node,
            controlOut: {
              x: normalized.x - node.position.x,
              y: normalized.y - node.position.y,
            },
          };
        }

        onEnvelopeChange(newEnv);
        canvas.style.cursor = "grabbing";
      } else {
        // Hover detection
        const target = hitTest(mx, my, w, h);
        setHoveredTarget(target);
        canvas.style.cursor = target ? "grab" : "default";
      }
    },
    [dragTarget, fromCanvas, onEnvelopeChange]
  );

  const handleMouseUp = useCallback(() => {
    setDragTarget(null);
    if (canvasRef.current) {
      canvasRef.current.style.cursor = "default";
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setDragTarget(null);
    setHoveredTarget(null);
    if (canvasRef.current) {
      canvasRef.current.style.cursor = "default";
    }
  }, []);

  // ── Double-click to add/remove nodes ─────────────────────
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      const target = hitTest(mx, my, w, h);

      if (target?.type === "node") {
        // Remove node (don't remove first or last)
        const env = envelopeRef.current;
        const idx = target.index;
        if (idx === 0 || idx === env.nodes.length - 1) return;

        const newEnv = structuredClone(env);
        newEnv.nodes.splice(idx, 1);
        onEnvelopeChange(newEnv);
      } else {
        // Add node at click position
        const normalized = fromCanvas(mx, my, w, h);
        const env = envelopeRef.current;
        const newEnv = structuredClone(env);

        // Find which segment to insert into
        let insertIdx = newEnv.nodes.length - 1;
        for (let i = 0; i < newEnv.nodes.length - 1; i++) {
          if (
            normalized.x >= newEnv.nodes[i].position.x &&
            normalized.x <= newEnv.nodes[i + 1].position.x
          ) {
            insertIdx = i + 1;
            break;
          }
        }

        const newNode: BezierNode = {
          position: {
            x: Math.max(0, Math.min(1, normalized.x)),
            y: Math.max(0, Math.min(1, normalized.y)),
          },
          controlIn: { x: -0.03, y: 0 },
          controlOut: { x: 0.03, y: 0 },
        };

        newEnv.nodes.splice(insertIdx, 0, newNode);
        onEnvelopeChange(newEnv);
      }
    },
    [fromCanvas, onEnvelopeChange]
  );

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg border border-neutral-800 overflow-hidden relative"
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: "block" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
      />
      {/* Mode label */}
      <div className="absolute top-2 right-2 text-[10px] text-neutral-600 font-mono pointer-events-none">
        {mode} envelope • dbl-click to add/remove nodes
      </div>
    </div>
  );
};
