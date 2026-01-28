/**
 * Maps Hat envelope UI parameters to backend engine parameters.
 */

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
        // Store choke flag (backend can use this for voice management)
        backendParams["hat"] = backendParams["hat"] || {};
        backendParams["hat"]["choke_group"] = envelopeParams.choke > 0.5;
    }

    // METAL envelope -> hat.metal.*
    if (envelopeParams.metal_amount_pct !== undefined) {
        const pct = envelopeParams.metal_amount_pct / 100;
        backendParams["hat"] = backendParams["hat"] || {};
        backendParams["hat"]["metal"] = backendParams["hat"]["metal"] || {};
        backendParams["hat"]["metal"]["gain_db"] = pct > 0 ? -12 + (pct * 12) : -200;
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
        const pct = envelopeParams.noise_amount_pct / 100;
        backendParams["hat"] = backendParams["hat"] || {};
        backendParams["hat"]["air"] = backendParams["hat"]["air"] || {};
        backendParams["hat"]["air"]["gain_db"] = pct > 0 ? -12 + (pct * 12) : -200;
        // Also map to legacy sheen macro
        backendParams["sheen"] = pct;
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
        backendParams["hat"] = backendParams["hat"] || {};
        backendParams["hat"]["stereo"] = backendParams["hat"]["stereo"] || {};
        backendParams["hat"]["stereo"]["width"] = envelopeParams.width_pct / 100;
    }
    if (envelopeParams.micro_delay_ms !== undefined) {
        backendParams["hat"] = backendParams["hat"] || {};
        backendParams["hat"]["stereo"] = backendParams["hat"]["stereo"] || {};
        backendParams["hat"]["stereo"]["delay_ms"] = envelopeParams.micro_delay_ms;
    }

    return backendParams;
}
