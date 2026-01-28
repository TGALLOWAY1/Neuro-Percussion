"use client";

import React from "react";
import { EnvelopeSpec, ParamSpec } from "@/audio/params/types";
import { EnvelopeGraph } from "./EnvelopeGraph";
import { ParamSlider } from "../params/ParamSlider";
import { ParamToggle } from "../params/ParamToggle";
import { RotateCcw } from "lucide-react";

interface EnvelopePanelProps {
    spec: EnvelopeSpec;
    values: Record<string, number>;
    onChange: (paramId: string, value: number) => void;
    onReset?: () => void;
}

export const EnvelopePanel: React.FC<EnvelopePanelProps> = ({
    spec,
    values,
    onChange,
    onReset,
}) => {
    const handleReset = () => {
        if (onReset) {
            onReset();
        } else {
            // Reset to defaults
            spec.params.forEach((param) => {
                onChange(param.id, param.default);
            });
        }
    };

    return (
        <div className="flex flex-col gap-4 p-4 bg-neutral-900/50 rounded-lg border border-neutral-800">
            {/* Header with reset */}
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-neutral-300 uppercase tracking-wider">
                    {spec.label}
                </h3>
                {onReset && (
                    <button
                        onClick={handleReset}
                        className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
                        title="Reset to defaults"
                    >
                        <RotateCcw size={14} />
                    </button>
                )}
            </div>

            {/* Envelope graph */}
            {spec.mode !== "NONE" && (
                <EnvelopeGraph
                    mode={spec.mode}
                    params={spec.params}
                    values={values}
                    width={200}
                    height={60}
                />
            )}

            {/* Parameters */}
            <div className="flex flex-col gap-3">
                {spec.params.map((param) => {
                    const value = values[param.id] ?? param.default;
                    if (param.unit === "bool") {
                        return (
                            <ParamToggle
                                key={param.id}
                                spec={param}
                                value={value}
                                onChange={(v) => onChange(param.id, v)}
                            />
                        );
                    } else {
                        return (
                            <ParamSlider
                                key={param.id}
                                spec={param}
                                value={value}
                                onChange={(v) => onChange(param.id, v)}
                            />
                        );
                    }
                })}
            </div>
        </div>
    );
};
