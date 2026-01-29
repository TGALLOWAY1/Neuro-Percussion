/**
 * Maps Hat envelope UI parameters to backend engine parameters.
 * Uses unit conversion helpers to ensure correct scaling and prevent double-conversion.
 * Returns consumed param ids for coverage checks.
 */

import { pctToLinear, pctToDbLinear, numberToBool } from "../units";

export interface HatEnvelopeParams {
    // AMP envelope
    attack_ms?: number;
    decay_ms?: number;
    curve?: number;
    choke?: number; // bool as number
    
    // METAL envelope
    metal_amount_pct?: number;
    inharmonicity?: number;
    brightness_hz?: number;
    
    // NOISE envelope
    noise_amount_pct?: number;
    noise_color?: number;
    hpf_cutoff_hz?: number;
    
    // STEREO envelope
    width_pct?: number;
    micro_delay_ms?: number;
    air_pct?: number;
}

export interface MapHatResult {
    result: Record<string, unknown>;
    consumed: string[];
}

/**
 * Maps Hat envelope params to backend format.
 * Returns result and list of envelope param ids that were consumed.
 */
export function mapHatParams(envelopeParams: HatEnvelopeParams): MapHatResult {
    const backendParams: Record<string, unknown> = {};
    const consumed: string[] = [];

    // AMP envelope -> hat.metal.amp.* (main layer)
    if (envelopeParams.attack_ms !== undefined) {
        if (!backendParams["hat"]) backendParams["hat"] = {};
        const hat = backendParams["hat"] as Record<string, unknown>;
        if (!hat["metal"]) hat["metal"] = {};
        const metal = hat["metal"] as Record<string, unknown>;
        if (!metal["amp"]) metal["amp"] = {};
        (metal["amp"] as Record<string, unknown>)["attack_ms"] = envelopeParams.attack_ms;
        consumed.push("attack_ms");
    }
    if (envelopeParams.decay_ms !== undefined) {
        if (!backendParams["hat"]) backendParams["hat"] = {};
        const hat = backendParams["hat"] as Record<string, unknown>;
        if (!hat["metal"]) hat["metal"] = {};
        const metal = hat["metal"] as Record<string, unknown>;
        if (!metal["amp"]) metal["amp"] = {};
        (metal["amp"] as Record<string, unknown>)["decay_ms"] = envelopeParams.decay_ms;
        consumed.push("decay_ms");
    }
    if (envelopeParams.choke !== undefined) {
        if (!backendParams["hat"]) backendParams["hat"] = {};
        (backendParams["hat"] as Record<string, unknown>)["choke_group"] = numberToBool(envelopeParams.choke);
        consumed.push("choke");
    }

    // METAL envelope -> hat.metal.*
    if (envelopeParams.metal_amount_pct !== undefined) {
        const gain_db = pctToDbLinear(envelopeParams.metal_amount_pct, -12, 0);
        if (!backendParams["hat"]) backendParams["hat"] = {};
        const hat = backendParams["hat"] as Record<string, unknown>;
        if (!hat["metal"]) hat["metal"] = {};
        (hat["metal"] as Record<string, unknown>)["gain_db"] = gain_db;
        consumed.push("metal_amount_pct");
    }
    if (envelopeParams.inharmonicity !== undefined) {
        if (!backendParams["hat"]) backendParams["hat"] = {};
        const hat = backendParams["hat"] as Record<string, unknown>;
        if (!hat["metal"]) hat["metal"] = {};
        (hat["metal"] as Record<string, unknown>)["ratio_jitter"] = envelopeParams.inharmonicity;
        consumed.push("inharmonicity");
    }
    if (envelopeParams.brightness_hz !== undefined) {
        if (!backendParams["hat"]) backendParams["hat"] = {};
        const hat = backendParams["hat"] as Record<string, unknown>;
        if (!hat["metal"]) hat["metal"] = {};
        (hat["metal"] as Record<string, unknown>)["brightness_hz"] = envelopeParams.brightness_hz;
        consumed.push("brightness_hz");
    }

    // NOISE envelope -> hat.air.*
    if (envelopeParams.noise_amount_pct !== undefined) {
        const gain_db = pctToDbLinear(envelopeParams.noise_amount_pct, -12, 0);
        if (!backendParams["hat"]) backendParams["hat"] = {};
        const hat = backendParams["hat"] as Record<string, unknown>;
        if (!hat["air"]) hat["air"] = {};
        (hat["air"] as Record<string, unknown>)["gain_db"] = gain_db;
        backendParams["sheen"] = pctToLinear(envelopeParams.noise_amount_pct);
        consumed.push("noise_amount_pct");
    }
    if (envelopeParams.noise_color !== undefined) {
        if (!backendParams["hat"]) backendParams["hat"] = {};
        const hat = backendParams["hat"] as Record<string, unknown>;
        if (!hat["air"]) hat["air"] = {};
        (hat["air"] as Record<string, unknown>)["noise_color"] = envelopeParams.noise_color;
        consumed.push("noise_color");
    }
    if (envelopeParams.hpf_cutoff_hz !== undefined) {
        if (!backendParams["hat"]) backendParams["hat"] = {};
        (backendParams["hat"] as Record<string, unknown>)["hpf_hz"] = envelopeParams.hpf_cutoff_hz;
        consumed.push("hpf_cutoff_hz");
    }

    // STEREO envelope -> hat.stereo.*
    if (envelopeParams.width_pct !== undefined) {
        if (!backendParams["hat"]) backendParams["hat"] = {};
        const hat = backendParams["hat"] as Record<string, unknown>;
        if (!hat["stereo"]) hat["stereo"] = {};
        (hat["stereo"] as Record<string, unknown>)["width"] = pctToLinear(envelopeParams.width_pct);
        consumed.push("width_pct");
    }
    if (envelopeParams.micro_delay_ms !== undefined) {
        if (!backendParams["hat"]) backendParams["hat"] = {};
        const hat = backendParams["hat"] as Record<string, unknown>;
        if (!hat["stereo"]) hat["stereo"] = {};
        (hat["stereo"] as Record<string, unknown>)["delay_ms"] = envelopeParams.micro_delay_ms;
        consumed.push("micro_delay_ms");
    }

    return { result: backendParams, consumed };
}
