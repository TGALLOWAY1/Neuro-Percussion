/**
 * Canvas2D waveform renderer — replaces wavesurfer.js WaveformViewer.
 * Draws audio buffer data as a waveform using Canvas2D + requestAnimationFrame.
 * Designed to later host the Bezier envelope overlay (Phase 2).
 */

"use client";

import React, { useRef, useEffect, useCallback } from "react";

interface WaveformCanvasProps {
  audioBuffer: AudioBuffer | null;
  width?: number;
  height?: number;
  color?: string;
  backgroundColor?: string;
}

export const WaveformCanvas: React.FC<WaveformCanvasProps> = ({
  audioBuffer,
  width,
  height = 128,
  color = "rgb(16, 185, 129)",
  backgroundColor = "rgb(23, 23, 23)",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    // Set canvas resolution for HiDPI
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, w, h);

    if (!audioBuffer) {
      // Draw placeholder
      ctx.strokeStyle = "rgb(64, 64, 64)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      return;
    }

    // Get audio data (mono mix of all channels)
    const channelData = audioBuffer.getChannelData(0);
    const samples = channelData.length;
    const samplesPerPixel = Math.max(1, Math.floor(samples / w));
    const midY = h / 2;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let x = 0; x < w; x++) {
      const start = x * samplesPerPixel;
      const end = Math.min(start + samplesPerPixel, samples);

      let min = 0;
      let max = 0;
      for (let i = start; i < end; i++) {
        const val = channelData[i];
        if (val < min) min = val;
        if (val > max) max = val;
      }

      const yMin = midY - max * midY;
      const yMax = midY - min * midY;

      ctx.moveTo(x, yMin);
      ctx.lineTo(x, yMax);
    }

    ctx.stroke();
  }, [audioBuffer, color, backgroundColor]);

  // Redraw on buffer change or resize
  useEffect(() => {
    draw();
  }, [draw]);

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

  return (
    <div ref={containerRef} className="w-full rounded-lg border border-neutral-800 overflow-hidden" style={{ height }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: "block" }}
      />
    </div>
  );
};
