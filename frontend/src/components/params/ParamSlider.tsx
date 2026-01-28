"use client";

import React from "react";
import { ParamSpec } from "@/audio/params/types";
import { getFormatter, clamp } from "@/audio/params/ranges";

interface ParamSliderProps {
    spec: ParamSpec;
    value: number;
    onChange: (value: number) => void;
}

export const ParamSlider: React.FC<ParamSliderProps> = ({ spec, value, onChange }) => {
    const formatter = spec.format || getFormatter(spec.unit);
    const clampedValue = clamp(value, spec.min, spec.max);
    const normalizedValue = (clampedValue - spec.min) / (spec.max - spec.min);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const normalized = parseFloat(e.target.value);
        const denormalized = spec.min + normalized * (spec.max - spec.min);
        onChange(denormalized);
    };

    return (
        <div className="flex flex-col gap-1 w-full">
            <div className="flex justify-between text-xs uppercase tracking-wider text-neutral-400">
                <span>{spec.label}</span>
                <span className="text-emerald-400 font-mono">{formatter(clampedValue)}</span>
            </div>
            <input
                type="range"
                min={0}
                max={1}
                step={spec.step ? spec.step / (spec.max - spec.min) : 0.01}
                value={normalizedValue}
                onChange={handleChange}
                className="w-full accent-emerald-500 h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
            />
        </div>
    );
};
