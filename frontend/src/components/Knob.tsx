"use client";

import React, { useCallback, useRef } from "react";
import { ParamSpec } from "@/audio/params/types";
import { getFormatter, clamp, normalize } from "@/audio/params/ranges";

interface KnobProps {
    spec: ParamSpec;
    value: number;
    onChange: (value: number) => void;
    size?: number;
    color?: string;
}

const START_ANGLE = 135;
const END_ANGLE = 405;
const SWEEP = END_ANGLE - START_ANGLE; // 270 degrees

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

export const Knob: React.FC<KnobProps> = ({
    spec,
    value,
    onChange,
    size = 48,
    color = "#10B981",
}) => {
    const dragRef = useRef<{ startY: number; startValue: number } | null>(null);
    const formatter = spec.format || getFormatter(spec.unit);
    const clamped = clamp(value, spec.min, spec.max);
    const norm = normalize(clamped, spec.min, spec.max);

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 4;
    const trackWidth = Math.max(2, size / 16);

    const valueAngle = START_ANGLE + norm * SWEEP;

    const trackPath = describeArc(cx, cy, r, START_ANGLE, END_ANGLE);
    const valuePath = norm > 0.005 ? describeArc(cx, cy, r, START_ANGLE, valueAngle) : "";

    // Indicator dot at current value position
    const indicator = polarToCartesian(cx, cy, r, valueAngle);

    const handlePointerDown = useCallback(
        (e: React.PointerEvent) => {
            e.preventDefault();
            e.stopPropagation();
            dragRef.current = { startY: e.clientY, startValue: norm };
            const el = e.currentTarget as HTMLElement;
            el.setPointerCapture(e.pointerId);
        },
        [norm]
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (!dragRef.current) return;
            const dy = dragRef.current.startY - e.clientY;
            // Sensitivity: 200px drag = full range
            const sensitivity = e.shiftKey ? 600 : 200;
            const newNorm = clamp(dragRef.current.startValue + dy / sensitivity, 0, 1);
            const newValue = spec.min + newNorm * (spec.max - spec.min);
            // Snap to step
            const stepped = spec.step
                ? Math.round(newValue / spec.step) * spec.step
                : newValue;
            onChange(clamp(stepped, spec.min, spec.max));
        },
        [spec, onChange]
    );

    const handlePointerUp = useCallback(() => {
        dragRef.current = null;
    }, []);

    return (
        <div className="flex flex-col items-center gap-1 select-none">
            {/* Value */}
            <span className="text-[10px] font-mono tabular-nums" style={{ color }}>
                {formatter(clamped)}
            </span>
            {/* Knob SVG */}
            <svg
                width={size}
                height={size}
                className="cursor-ns-resize"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                style={{ touchAction: "none" }}
            >
                {/* Track background */}
                <path
                    d={trackPath}
                    fill="none"
                    stroke="#404040"
                    strokeWidth={trackWidth}
                    strokeLinecap="round"
                />
                {/* Value arc */}
                {valuePath && (
                    <path
                        d={valuePath}
                        fill="none"
                        stroke={color}
                        strokeWidth={trackWidth}
                        strokeLinecap="round"
                    />
                )}
                {/* Center circle */}
                <circle
                    cx={cx}
                    cy={cy}
                    r={r - trackWidth - 2}
                    fill="#1a1a1a"
                    stroke="#333"
                    strokeWidth={1}
                />
                {/* Indicator dot */}
                <circle cx={indicator.x} cy={indicator.y} r={Math.max(2, trackWidth / 1.5)} fill={color} />
            </svg>
            {/* Label */}
            <span className="text-[10px] text-neutral-500 uppercase tracking-wider text-center leading-tight max-w-[72px]">
                {spec.label}
            </span>
        </div>
    );
};
