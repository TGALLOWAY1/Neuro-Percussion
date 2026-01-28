"use client";

import React, { useMemo } from "react";
import { EnvelopeMode, ParamSpec } from "@/audio/params/types";

interface EnvelopeGraphProps {
    mode: EnvelopeMode;
    params: ParamSpec[];
    values: Record<string, number>;
    width?: number;
    height?: number;
}

export const EnvelopeGraph: React.FC<EnvelopeGraphProps> = ({
    mode,
    params,
    values,
    width = 200,
    height = 60,
}) => {
    const points = useMemo(() => {
        if (mode === "NONE") return [];

        const padding = 8;
        const w = width - padding * 2;
        const h = height - padding * 2;

        if (mode === "AD") {
            const attackMs = values[params.find((p) => p.id.includes("attack"))?.id || ""] || 0;
            const decayMs = values[params.find((p) => p.id.includes("decay"))?.id || ""] || 0;
            const totalMs = attackMs + decayMs;
            const maxMs = Math.max(totalMs, 100); // Minimum scale

            const attackX = (attackMs / maxMs) * w;
            const decayX = w;

            return [
                { x: padding, y: padding + h },
                { x: padding + attackX, y: padding },
                { x: padding + decayX, y: padding + h },
            ];
        } else if (mode === "AHD") {
            const attackMs = values[params.find((p) => p.id.includes("attack"))?.id || ""] || 0;
            const holdMs = values[params.find((p) => p.id.includes("hold"))?.id || ""] || 0;
            const decayMs = values[params.find((p) => p.id.includes("decay"))?.id || ""] || 0;
            const totalMs = attackMs + holdMs + decayMs;
            const maxMs = Math.max(totalMs, 100);

            const attackX = (attackMs / maxMs) * w;
            const holdX = ((attackMs + holdMs) / maxMs) * w;
            const decayX = w;

            return [
                { x: padding, y: padding + h },
                { x: padding + attackX, y: padding },
                { x: padding + holdX, y: padding },
                { x: padding + decayX, y: padding + h },
            ];
        }

        return [];
    }, [mode, params, values, width, height]);

    if (mode === "NONE" || points.length === 0) {
        return (
            <div
                className="flex items-center justify-center bg-neutral-900 rounded border border-neutral-800"
                style={{ width, height }}
            >
                <span className="text-xs text-neutral-600">No envelope</span>
            </div>
        );
    }

    const pathData = points
        .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
        .join(" ");

    return (
        <svg
            width={width}
            height={height}
            className="bg-neutral-900 rounded border border-neutral-800"
        >
            <path
                d={pathData}
                fill="none"
                stroke="rgb(16, 185, 129)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {points.map((p, i) => (
                <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r="3"
                    fill="rgb(16, 185, 129)"
                    className="cursor-pointer hover:r-4"
                />
            ))}
        </svg>
    );
};
