import React from "react";

interface MacroSliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (val: number) => void;
}

export const MacroSlider: React.FC<MacroSliderProps> = ({
    label,
    value,
    min,
    max,
    step = 0.01,
    onChange,
}) => {
    return (
        <div className="flex flex-col gap-1 w-full">
            <div className="flex justify-between text-xs uppercase tracking-wider text-neutral-400">
                <span>{label}</span>
                <span>{value.toFixed(2)}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
            />
        </div>
    );
};
