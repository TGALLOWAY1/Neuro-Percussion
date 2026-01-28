/**
 * Parameter specification types for envelope controls.
 * Provides type-safe definitions for UI rendering and parameter mapping.
 */

export type ParamUnit = "ms" | "hz" | "st" | "pct" | "db" | "x" | "bool";

export type EnvelopeMode = "AD" | "AHD" | "NONE";

export type InstrumentType = "kick" | "snare" | "hat";

/**
 * Format function for displaying parameter values with units.
 */
export type ParamFormatter = (value: number) => string;

/**
 * Parameter specification for a single control.
 */
export interface ParamSpec {
    /** Unique identifier (e.g., "attack_ms", "pitch_hz") */
    id: string;
    /** Display label (e.g., "Attack", "Pitch") */
    label: string;
    /** Unit type for display and validation */
    unit: ParamUnit;
    /** Minimum value */
    min: number;
    /** Maximum value */
    max: number;
    /** Step size for slider */
    step?: number;
    /** Default value */
    default: number;
    /** Optional custom formatter (defaults to unit-based formatting) */
    format?: ParamFormatter;
}

/**
 * Envelope specification for a group of related parameters.
 */
export interface EnvelopeSpec {
    /** Unique identifier (e.g., "amp", "pitch", "click") */
    id: string;
    /** Display label (e.g., "AMP", "PITCH", "CLICK") */
    label: string;
    /** Envelope mode: AD (Attack-Decay), AHD (Attack-Hold-Decay), or NONE (no graph) */
    mode: EnvelopeMode;
    /** Parameters in this envelope group */
    params: ParamSpec[];
}

/**
 * Complete parameter specification for a drum instrument.
 */
export interface DrumParamSpec {
    /** Instrument type */
    drum: InstrumentType;
    /** Envelope groups (tabs) */
    envelopes: EnvelopeSpec[];
    /** Optional advanced parameters (not shown in main UI) */
    advanced?: ParamSpec[];
}
