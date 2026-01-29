/**
 * Maps Hat envelope UI parameters to backend engine parameters.
 * Uses unit conversion helpers to ensure correct scaling and prevent double-conversion.
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

/**
 * Maps Hat envelope params to backend format.
 */
export function mapHatParams(envelopeParams: HatEnvelopeParams): Record<string, any> {
    const backendParams: Record<string, any> = {};

    // AMP envelope -> hat.metal.amp.* (main layer)
    if (envelopeParams.attack_ms !== undefined) {
        backendParams["hat"] = backendParams["hat"] || {};
        backendParams["hat"]["metal"] = backendParams["hat"]["metal"] || {};
        backendParams["hat"]["metal"]["amp"] = backendParams["hat"]["metal"]["amp"] || {};
        backendParams["hat"]["metal"]["amp"]["attack_ms"] = envelopeParams.attack_ms;
    }
    if (envelopeParams.decay_ms !== undefined) {
        backendParams["hat"] = backendParams["hat"] || {};
        backendParams["hat"]["metal"] = backendParams["hat"]["metal"] || {};
        backendParams["hat"]["metal"]["amp"] = backendParams["hat"]["metal"]["amp"] || {};
        backendParams["hat"]["metal"]["amp"]["decay_ms"] = envelopeParams.decay_ms;
    }
    if (envelopeParams.choke !== undefined) {
        // Convert number to boolean: threshold at 0.5 (0-1 range -> false/true)
        backendParams["hat"] = backendParams["hat"] || {};
        backendParams["hat"]["choke_group"] = numberToBool(envelopeParams.choke);
    }

    // METAL envelope -> hat.metal.*
    if (envelopeParams.metal_amount_pct !== undefined) {
        // Convert percentage to gain_db: 0-100% -> -12dB to 0dB (linear mapping)
        const gain_db = pctToDbLinear(envelopeParams.metal_amount_pct, -12, 0);
        backendParams["hat"] = backendParams["hat"] || {};
        backendParams["hat"]["metal"] = backendParams["hat"]["metal"] || {};
        backendParams["hat"]["metal"]["gain_db"] = gain_db;
    }
    if (envelopeParams.inharmonicity !== undefined) {
        backendParams["hat"] = backendParams["hat"] || {};
        backendParams["hat"]["metal"] = backendParams["hat"]["metal"] || {};
        backendParams["hat"]["metal"]["ratio_jitter"] = envelopeParams.inharmonicity;
    }
    if (envelopeParams.brightness_hz !== undefined) {
        backendParams["hat"] = backendParams["hat"] || {};
        backendParams["hat"]["metal"] = backendParams["hat"]["metal"] || {};
        backendParams["hat"]["metal"]["brightness_hz"] = envelopeParams.brightness_hz;
    }

    // NOISE envelope -> hat.air.*
    if (envelopeParams.noise_amount_pct !== undefined) {
        // Convert percentage to gain_db: 0-100% -> -12dB to 0dB (linear mapping)
        const gain_db = pctToDbLinear(envelopeParams.noise_amount_pct, -12, 0);
        backendParams["hat"] = backendParams["hat"] || {};
        backendParams["hat"]["air"] = backendParams["hat"]["air"] || {};
        backendParams["hat"]["air"]["gain_db"] = gain_db;
        // Also map to legacy sheen macro (0-1 linear range)
        backendParams["sheen"] = pctToLinear(envelopeParams.noise_amount_pct);
    }
    if (envelopeParams.noise_color !== undefined) {
        backendParams["hat"] = backendParams["hat"] || {};
        backendParams["hat"]["air"] = backendParams["hat"]["air"] || {};
        backendParams["hat"]["air"]["noise_color"] = envelopeParams.noise_color;
    }
    if (envelopeParams.hpf_cutoff_hz !== undefined) {
        backendParams["hat"] = backendParams["hat"] || {};
        backendParams["hat"]["hpf_hz"] = envelopeParams.hpf_cutoff_hz;
    }

    // STEREO envelope -> hat.stereo.* (if backend supports)
    if (envelopeParams.width_pct !== undefined) {
        // Convert percentage to linear ratio: 0-150% -> 0-1.5 (for stereo width)
        backendParams["hat"] = backendParams["hat"] || {};
        backendParams["hat"]["stereo"] = backendParams["hat"]["stereo"] || {};
        backendParams["hat"]["stereo"]["width"] = pctToLinear(envelopeParams.width_pct);
    }
    if (envelopeParams.micro_delay_ms !== undefined) {
        backendParams["hat"] = backendParams["hat"] || {};
        backendParams["hat"]["stereo"] = backendParams["hat"]["stereo"] || {};
        backendParams["hat"]["stereo"]["delay_ms"] = envelopeParams.micro_delay_ms;
    }

    return backendParams;
}
