"use client";

import React, { useState } from "react";
import { DrumParamSpec, EnvelopeSpec } from "@/audio/params/types";
import { EnvelopePanel } from "./EnvelopePanel";
import clsx from "clsx";

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
    const [activeEnvelope, setActiveEnvelope] = useState<string>(spec.envelopes[0]?.id || "");

    const currentEnvelope = spec.envelopes.find((e) => e.id === activeEnvelope);

    // Extract values for current envelope
    const envelopeValues: Record<string, number> = {};
    if (currentEnvelope) {
        currentEnvelope.params.forEach((param) => {
            envelopeValues[param.id] = values[param.id] ?? param.default;
        });
    }

    const handleEnvelopeChange = (paramId: string, value: number) => {
        onChange(paramId, value);
    };

    const handleReset = () => {
        if (currentEnvelope && onReset) {
            onReset(currentEnvelope.id);
        }
    };

    return (
        <div className="flex flex-col gap-3">
            {/* Segmented control for envelope selection */}
            <div className="flex bg-neutral-900 rounded-lg p-1 gap-1 overflow-x-auto">
                {spec.envelopes.map((env) => (
                    <button
                        key={env.id}
                        onClick={() => setActiveEnvelope(env.id)}
                        className={clsx(
                            "px-3 py-1.5 text-xs font-semibold rounded-md uppercase tracking-wider transition-all whitespace-nowrap",
                            activeEnvelope === env.id
                                ? "bg-emerald-600 text-white shadow-lg"
                                : "text-neutral-500 hover:text-neutral-300"
                        )}
                    >
                        {env.label}
                    </button>
                ))}
            </div>

            {/* Active envelope panel */}
            {currentEnvelope && (
                <EnvelopePanel
                    spec={currentEnvelope}
                    values={envelopeValues}
                    onChange={handleEnvelopeChange}
                    onReset={handleReset}
                />
            )}
        </div>
    );
};
