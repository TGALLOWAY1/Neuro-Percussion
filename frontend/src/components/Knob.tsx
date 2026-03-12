/**
 * Knob — SVG rotary knob control for VST-style parameter adjustment.
 * Vertical drag interaction with shift for fine control.
 */

"use client";

import React, { useRef, useCallback, useState } from "react";

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  size?: number;
  color?: string;
  formatValue?: (v: number) => string;
}

const ARC_START = 135; // degrees
const ARC_END = 405;   // degrees
const ARC_RANGE = ARC_END - ARC_START; // 270°

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function defaultFormat(v: number, unit?: string): string {
  if (unit === "hz" && v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (unit === "ms" && v >= 1000) return `${(v / 1000).toFixed(1)}s`;
  if (unit === "pct") return `${Math.round(v)}%`;
  if (unit === "db") return `${v.toFixed(1)}dB`;
  if (v === Math.floor(v)) return String(v);
  if (Math.abs(v) < 10) return v.toFixed(2);
  return v.toFixed(1);
}

export const Knob: React.FC<KnobProps> = React.memo(({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit,
  onChange,
  size = 48,
  color = "#10B981",
  formatValue,
}) => {
  const dragRef = useRef<{ startY: number; startValue: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = ARC_START + normalized * ARC_RANGE;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  const trackR = r - 2;

  const indicator = polarToCartesian(cx, cy, trackR - 4, angle);
  const indicatorInner = polarToCartesian(cx, cy, trackR - 10, angle);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { startY: e.clientY, startValue: value };
      setIsDragging(true);
    },
    [value]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const sensitivity = e.shiftKey ? 600 : 200;
      const dy = dragRef.current.startY - e.clientY;
      const range = max - min;
      const delta = (dy / sensitivity) * range;
      let newValue = dragRef.current.startValue + delta;
      newValue = Math.round(newValue / step) * step;
      newValue = Math.max(min, Math.min(max, newValue));
      onChange(newValue);
    },
    [min, max, step, onChange]
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    // Reset to default — caller can pass default as the initial value
  }, []);

  const displayValue = formatValue
    ? formatValue(value)
    : defaultFormat(value, unit);

  return (
    <div className="flex flex-col items-center gap-1 select-none" style={{ minWidth: size + 20 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="cursor-ns-resize"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        style={{ touchAction: "none" }}
      >
        {/* Track background */}
        <path
          d={describeArc(cx, cy, trackR, ARC_START, ARC_END)}
          fill="none"
          stroke="#333"
          strokeWidth={3}
          strokeLinecap="round"
        />
        {/* Active arc */}
        {normalized > 0.005 && (
          <path
            d={describeArc(cx, cy, trackR, ARC_START, angle)}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            opacity={isDragging ? 1 : 0.85}
          />
        )}
        {/* Knob body */}
        <circle
          cx={cx}
          cy={cy}
          r={trackR - 6}
          fill="#1a1a1a"
          stroke={isDragging ? color : "#444"}
          strokeWidth={1.5}
        />
        {/* Indicator line */}
        <line
          x1={indicatorInner.x}
          y1={indicatorInner.y}
          x2={indicator.x}
          y2={indicator.y}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </svg>
      <span className="text-[9px] font-mono text-emerald-400 leading-none">
        {displayValue}
      </span>
      <span className="text-[8px] text-neutral-500 uppercase tracking-wider leading-tight text-center max-w-[70px]">
        {label}
      </span>
    </div>
  );
});
Knob.displayName = "Knob";
