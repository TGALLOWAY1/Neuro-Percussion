/**
 * Parameter range validation and formatting utilities.
 */

import { ParamUnit, ParamFormatter } from "./types";

/**
 * Default formatters for each unit type.
 */
const DEFAULT_FORMATTERS: Record<ParamUnit, ParamFormatter> = {
    ms: (v) => `${v.toFixed(1)} ms`,
    hz: (v) => `${v.toFixed(0)} Hz`,
    st: (v) => `${v.toFixed(1)} st`,
    pct: (v) => `${v.toFixed(0)}%`,
    db: (v) => `${v.toFixed(1)} dB`,
    x: (v) => v.toFixed(2),
    bool: (v) => v > 0.5 ? "On" : "Off",
};

/**
 * Get the default formatter for a unit type.
 */
export function getFormatter(unit: ParamUnit): ParamFormatter {
    return DEFAULT_FORMATTERS[unit];
}

/**
 * Clamp a value to a range.
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * Normalize a value from [min, max] to [0, 1].
 */
export function normalize(value: number, min: number, max: number): number {
    if (max === min) return 0;
    return (value - min) / (max - min);
}

/**
 * Denormalize a value from [0, 1] to [min, max].
 */
export function denormalize(value: number, min: number, max: number): number {
    return min + value * (max - min);
}
