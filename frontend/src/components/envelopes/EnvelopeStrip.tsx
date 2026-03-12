"use client";

import React from "react";
import { DrumParamSpec } from "@/audio/params/types";
import { InteractiveEnvelopeGraph } from "./InteractiveEnvelopeGraph";

/** Color per envelope id */
const ENVELOPE_COLORS: Record<string, string> = {
    amp: "#10B981",     // emerald
    pitch: "#F59E0B",   // amber
    click: "#3B82F6",   // blue
    body: "#F59E0B",    // amber
    noise: "#8B5CF6",   // violet
    snap: "#EF4444",    // red
    metal: "#F59E0B",   // amber
    stereo: "#06B6D4",  // cyan
};

interface EnvelopeStripProps {
    spec: DrumParamSpec;
    values: Record<string, number>;
    onChange: (paramId: string, value: number) => void;
    onReset?: (envelopeId: string) => void;
}

export const EnvelopeStrip: React.FC<EnvelopeStripProps> = ({
    spec,
    values,
    onChange,
    onReset,
}) => {
    // Show all envelopes that have a graph (mode !== "NONE") simultaneously
    const graphEnvelopes = spec.envelopes.filter((e) => e.mode !== "NONE");

    if (graphEnvelopes.length === 0) return null;

    return (
        <div className="flex flex-col gap-3">
            {graphEnvelopes.map((env) => (
                <InteractiveEnvelopeGraph
                    key={env.id}
                    spec={env}
                    values={values}
                    onChange={onChange}
                    onReset={onReset ? () => onReset(env.id) : undefined}
                    color={ENVELOPE_COLORS[env.id] ?? "#10B981"}
                    height={160}
                />
            ))}
        </div>
    );
};
