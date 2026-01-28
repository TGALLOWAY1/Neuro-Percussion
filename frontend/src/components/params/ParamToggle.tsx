"use client";

import React from "react";
import { ParamSpec } from "@/audio/params/types";
import { getFormatter } from "@/audio/params/ranges";

interface ParamToggleProps {
    spec: ParamSpec;
    value: number;
    onChange: (value: number) => void;
}

export const ParamToggle: React.FC<ParamToggleProps> = ({ spec, value, onChange }) => {
    const formatter = spec.format || getFormatter(spec.unit);
    const isOn = value > 0.5;

    const handleToggle = () => {
        onChange(isOn ? 0 : 1);
    };

    return (
        <div className="flex items-center justify-between w-full">
            <span className="text-xs uppercase tracking-wider text-neutral-400">{spec.label}</span>
            <button
                onClick={handleToggle}
                className={`
                    relative w-12 h-6 rounded-full transition-colors
                    ${isOn ? "bg-emerald-600" : "bg-neutral-700"}
                `}
            >
                <span
                    className={`
                        absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform
                        ${isOn ? "translate-x-6" : "translate-x-0"}
                    `}
                />
            </button>
            <span className="text-xs text-emerald-400 font-mono w-12 text-right">
                {formatter(value)}
            </span>
        </div>
    );
};
