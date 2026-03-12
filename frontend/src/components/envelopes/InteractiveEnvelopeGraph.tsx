"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EnvelopeSpec, ParamSpec } from "@/audio/params/types";
import { clamp } from "@/audio/params/ranges";
import { RotateCcw, Settings } from "lucide-react";

interface InteractiveEnvelopeGraphProps {
    spec: EnvelopeSpec;
    values: Record<string, number>;
    onChange: (paramId: string, value: number) => void;
    onReset?: () => void;
    color?: string;
    height?: number;
}

// Layout constants
const AXIS_LEFT = 44;
const AXIS_BOTTOM = 24;
const PAD_TOP = 8;
const PAD_RIGHT = 16;

interface Point {
    x: number;
    y: number;
    paramIdX?: string;
    paramIdY?: string;
    draggableX: boolean;
    draggableY: boolean;
}

function findParam(params: ParamSpec[], keyword: string): ParamSpec | undefined {
    return params.find((p) => p.id.includes(keyword));
}

function niceTimeTicks(maxMs: number): number[] {
    const ticks: number[] = [];
    let step: number;
    if (maxMs <= 20) step = 5;
    else if (maxMs <= 50) step = 10;
    else if (maxMs <= 200) step = 50;
    else if (maxMs <= 500) step = 100;
    else if (maxMs <= 1500) step = 250;
    else if (maxMs <= 3000) step = 500;
    else step = 1000;

    for (let t = 0; t <= maxMs; t += step) {
        ticks.push(t);
    }
    return ticks;
}

function niceLevelTicks(): number[] {
    return [0, 0.25, 0.5, 0.75, 1.0];
}

export const InteractiveEnvelopeGraph: React.FC<InteractiveEnvelopeGraphProps> = ({
    spec,
    values,
    onChange,
    onReset,
    color = "#10B981",
    height = 180,
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerDivRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(600);
    const [dragIdx, setDragIdx] = useState<number | null>(null);

    // Measure container
    useEffect(() => {
        const node = containerDivRef.current;
        if (!node) return;
        setContainerWidth(node.clientWidth);
        const obs = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });
        obs.observe(node);
        return () => obs.disconnect();
    }, []);

    const plotW = containerWidth - AXIS_LEFT - PAD_RIGHT;
    const plotH = height - PAD_TOP - AXIS_BOTTOM;

    // Build points and path from envelope spec
    const { points, pathD, fillD, maxMs } = useMemo(() => {
        const pts: Point[] = [];
        if (spec.mode === "NONE") return { points: pts, pathD: "", fillD: "", maxMs: 100 };

        const attackParam = findParam(spec.params, "attack");
        const decayParam = findParam(spec.params, "decay");
        const holdParam = findParam(spec.params, "hold");
        const curveParam = findParam(spec.params, "curve");

        const attackMs = attackParam ? (values[attackParam.id] ?? attackParam.default) : 0;
        const decayMs = decayParam ? (values[decayParam.id] ?? decayParam.default) : 0;
        const holdMs = holdParam ? (values[holdParam.id] ?? holdParam.default) : 0;

        const curve = curveParam ? (values[curveParam.id] ?? curveParam.default) : 1.5;

        const totalMs = attackMs + holdMs + decayMs;
        const mMs = Math.max(totalMs * 1.1, 50); // 10% padding

        const timeToX = (ms: number) => AXIS_LEFT + (ms / mMs) * plotW;
        const levelToY = (level: number) => PAD_TOP + (1 - level) * plotH;

        // Start point (0, 0)
        pts.push({
            x: timeToX(0),
            y: levelToY(0),
            draggableX: false,
            draggableY: false,
        });

        if (spec.mode === "AHD") {
            // Attack peak
            pts.push({
                x: timeToX(attackMs),
                y: levelToY(1),
                paramIdX: attackParam?.id,
                draggableX: true,
                draggableY: false,
            });
            // Hold end
            pts.push({
                x: timeToX(attackMs + holdMs),
                y: levelToY(1),
                paramIdX: holdParam?.id,
                draggableX: true,
                draggableY: false,
            });
            // Decay end
            pts.push({
                x: timeToX(attackMs + holdMs + decayMs),
                y: levelToY(0),
                paramIdX: decayParam?.id,
                draggableX: true,
                draggableY: false,
            });
        } else {
            // AD mode
            pts.push({
                x: timeToX(attackMs),
                y: levelToY(1),
                paramIdX: attackParam?.id,
                draggableX: true,
                draggableY: false,
            });
            pts.push({
                x: timeToX(attackMs + decayMs),
                y: levelToY(0),
                paramIdX: decayParam?.id,
                draggableX: true,
                draggableY: false,
            });
        }

        // Generate curved path
        let path = `M ${pts[0].x} ${pts[0].y}`;
        // Attack: straight line to peak
        path += ` L ${pts[1].x} ${pts[1].y}`;

        if (spec.mode === "AHD") {
            // Hold: straight line
            path += ` L ${pts[2].x} ${pts[2].y}`;
            // Decay: exponential curve
            const decayStart = pts[2];
            const decayEnd = pts[3];
            const steps = 32;
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const curvedT = 1 - Math.pow(1 - t, curve);
                const x = decayStart.x + (decayEnd.x - decayStart.x) * t;
                const y = decayStart.y + (decayEnd.y - decayStart.y) * curvedT;
                path += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
            }
        } else {
            // AD: exponential decay curve
            const decayStart = pts[1];
            const decayEnd = pts[2];
            const steps = 32;
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const curvedT = 1 - Math.pow(1 - t, curve);
                const x = decayStart.x + (decayEnd.x - decayStart.x) * t;
                const y = decayStart.y + (decayEnd.y - decayStart.y) * curvedT;
                path += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
            }
        }

        // Fill path (same as stroke path but closed to bottom)
        const lastPt = pts[pts.length - 1];
        const fill = path + ` L ${lastPt.x} ${PAD_TOP + plotH} L ${pts[0].x} ${PAD_TOP + plotH} Z`;

        return { points: pts, pathD: path, fillD: fill, maxMs: mMs };
    }, [spec, values, plotW, plotH]);

    // Drag handling
    const handlePointerDown = useCallback(
        (idx: number, e: React.PointerEvent) => {
            if (!points[idx].draggableX && !points[idx].draggableY) return;
            e.preventDefault();
            e.stopPropagation();
            setDragIdx(idx);
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        },
        [points]
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (dragIdx === null || !svgRef.current) return;
            const pt = points[dragIdx];
            if (!pt) return;

            const svgRect = svgRef.current.getBoundingClientRect();
            const mouseX = e.clientX - svgRect.left;

            if (pt.draggableX && pt.paramIdX) {
                const param = spec.params.find((p) => p.id === pt.paramIdX);
                if (!param) return;

                // Convert pixel X to time ms
                const plotXFrac = clamp((mouseX - AXIS_LEFT) / plotW, 0, 1);
                let ms = plotXFrac * maxMs;

                // For hold and decay, we need to subtract preceding times
                if (spec.mode === "AHD") {
                    const attackParam = findParam(spec.params, "attack");
                    const holdParam = findParam(spec.params, "hold");
                    const attackMs = attackParam ? (values[attackParam.id] ?? attackParam.default) : 0;
                    const holdMs = holdParam ? (values[holdParam.id] ?? holdParam.default) : 0;

                    if (param.id.includes("hold")) {
                        ms = Math.max(0, ms - attackMs);
                    } else if (param.id.includes("decay") && !param.id.includes("pitch")) {
                        ms = Math.max(0, ms - attackMs - holdMs);
                    }
                } else {
                    // AD mode: decay is relative to attack end
                    if (param.id.includes("decay") && !param.id.includes("pitch")) {
                        const attackParam = findParam(spec.params, "attack");
                        const attackMs = attackParam ? (values[attackParam.id] ?? attackParam.default) : 0;
                        ms = Math.max(0, ms - attackMs);
                    }
                }

                const stepped = param.step
                    ? Math.round(ms / param.step) * param.step
                    : ms;
                onChange(param.id, clamp(stepped, param.min, param.max));
            }
        },
        [dragIdx, points, spec, values, onChange, plotW, maxMs]
    );

    const handlePointerUp = useCallback(() => {
        setDragIdx(null);
    }, []);

    if (spec.mode === "NONE") return null;

    const timeTicks = niceTimeTicks(maxMs);
    const levelTicks = niceLevelTicks();

    return (
        <div ref={containerDivRef} className="flex flex-col bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800/50">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color }}>
                    {spec.label} Envelope
                </span>
                <div className="flex items-center gap-1">
                    {onReset && (
                        <button
                            onClick={onReset}
                            className="p-1 text-neutral-600 hover:text-neutral-400 transition-colors"
                            title="Reset to defaults"
                        >
                            <RotateCcw size={12} />
                        </button>
                    )}
                    <button className="p-1 text-neutral-600 hover:text-neutral-400 transition-colors">
                        <Settings size={12} />
                    </button>
                </div>
            </div>

            {/* Graph */}
            <svg
                ref={svgRef}
                width={containerWidth}
                height={height}
                className="select-none"
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                style={{ touchAction: "none" }}
            >
                {/* Grid lines - horizontal */}
                {levelTicks.map((level) => {
                    const y = PAD_TOP + (1 - level) * plotH;
                    return (
                        <g key={`h-${level}`}>
                            <line
                                x1={AXIS_LEFT}
                                y1={y}
                                x2={AXIS_LEFT + plotW}
                                y2={y}
                                stroke="#262626"
                                strokeWidth={1}
                            />
                            <text
                                x={AXIS_LEFT - 6}
                                y={y + 3}
                                textAnchor="end"
                                className="text-[9px] fill-neutral-600"
                            >
                                {level.toFixed(level === 0 || level === 1 ? 1 : 2)}
                            </text>
                        </g>
                    );
                })}

                {/* Grid lines - vertical */}
                {timeTicks.map((ms) => {
                    const x = AXIS_LEFT + (ms / maxMs) * plotW;
                    return (
                        <g key={`v-${ms}`}>
                            <line
                                x1={x}
                                y1={PAD_TOP}
                                x2={x}
                                y2={PAD_TOP + plotH}
                                stroke="#262626"
                                strokeWidth={1}
                            />
                            <text
                                x={x}
                                y={PAD_TOP + plotH + 14}
                                textAnchor="middle"
                                className="text-[9px] fill-neutral-600"
                            >
                                {ms}
                            </text>
                        </g>
                    );
                })}

                {/* Axis labels */}
                <text
                    x={AXIS_LEFT + plotW / 2}
                    y={height - 2}
                    textAnchor="middle"
                    className="text-[8px] fill-neutral-700"
                >
                    Time (ms)
                </text>
                <text
                    x={8}
                    y={PAD_TOP + plotH / 2}
                    textAnchor="middle"
                    className="text-[8px] fill-neutral-700"
                    transform={`rotate(-90, 8, ${PAD_TOP + plotH / 2})`}
                >
                    Level
                </text>

                {/* Filled area */}
                <path d={fillD} fill={color} fillOpacity={0.08} />

                {/* Stroke path */}
                <path
                    d={pathD}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />

                {/* Draggable control points */}
                {points.map((pt, i) => {
                    if (!pt.draggableX && !pt.draggableY) return null;
                    const isActive = dragIdx === i;
                    return (
                        <circle
                            key={i}
                            cx={pt.x}
                            cy={pt.y}
                            r={isActive ? 7 : 5}
                            fill={color}
                            stroke="#000"
                            strokeWidth={1.5}
                            className="cursor-grab active:cursor-grabbing"
                            onPointerDown={(e) => handlePointerDown(i, e)}
                            style={{ transition: isActive ? "none" : "r 0.1s" }}
                        />
                    );
                })}
            </svg>
        </div>
    );
};
