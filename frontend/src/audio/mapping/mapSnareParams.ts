/**
 * Maps Snare envelope UI parameters to backend engine parameters.
 */

export interface SnareEnvelopeParams {
    // AMP envelope
    attack_ms?: number;
    decay_ms?: number;
    curve?: number;
    
    // BODY envelope
    body_pitch_hz?: number;
    body_decay_ms?: number;
    body_amount_pct?: number;
    
    // NOISE envelope
    noise_amount_pct?: number;
    noise_decay_ms?: number;
    noise_color?: number;
    noise_band_center_hz?: number;
    noise_band_q?: number;
    
    // SNAP envelope
    snap_amount_pct?: number;
    snap_decay_ms?: number;
    snap_tone_hz?: number;
}

/**
 * Maps Snare envelope params to backend format.
 */
export function mapSnareParams(envelopeParams: SnareEnvelopeParams): Record<string, any> {
    const backendParams: Record<string, any> = {};

    // AMP envelope -> snare.shell.amp.* (main body)
    if (envelopeParams.attack_ms !== undefined) {
        backendParams["snare"] = backendParams["snare"] || {};
        backendParams["snare"]["shell"] = backendParams["snare"]["shell"] || {};
        backendParams["snare"]["shell"]["amp"] = backendParams["snare"]["shell"]["amp"] || {};
        backendParams["snare"]["shell"]["amp"]["attack_ms"] = envelopeParams.attack_ms;
    }
    if (envelopeParams.decay_ms !== undefined) {
        backendParams["snare"] = backendParams["snare"] || {};
        backendParams["snare"]["shell"] = backendParams["snare"]["shell"] || {};
        backendParams["snare"]["shell"]["amp"] = backendParams["snare"]["shell"]["amp"] || {};
        backendParams["snare"]["shell"]["amp"]["decay_ms"] = envelopeParams.decay_ms;
    }

    // BODY envelope -> snare.shell.*
    if (envelopeParams.body_pitch_hz !== undefined) {
        backendParams["snare"] = backendParams["snare"] || {};
        backendParams["snare"]["shell"] = backendParams["snare"]["shell"] || {};
        backendParams["snare"]["shell"]["pitch_hz"] = envelopeParams.body_pitch_hz;
    }
    if (envelopeParams.body_decay_ms !== undefined) {
        backendParams["snare"] = backendParams["snare"] || {};
        backendParams["snare"]["shell"] = backendParams["snare"]["shell"] || {};
        backendParams["snare"]["shell"]["amp"] = backendParams["snare"]["shell"]["amp"] || {};
        backendParams["snare"]["shell"]["amp"]["decay_ms"] = envelopeParams.body_decay_ms;
    }
    if (envelopeParams.body_amount_pct !== undefined) {
        const pct = envelopeParams.body_amount_pct / 100;
        backendParams["snare"] = backendParams["snare"] || {};
        backendParams["snare"]["shell"] = backendParams["snare"]["shell"] || {};
        backendParams["snare"]["shell"]["gain_db"] = pct > 0 ? -6 + (pct * 6) : -200;
    }

    // NOISE envelope -> snare.wires.*
    if (envelopeParams.noise_amount_pct !== undefined) {
        const pct = envelopeParams.noise_amount_pct / 100;
        backendParams["snare"] = backendParams["snare"] || {};
        backendParams["snare"]["wires"] = backendParams["snare"]["wires"] || {};
        backendParams["snare"]["wires"]["gain_db"] = pct > 0 ? -18 + (pct * 21) : -200; // -18dB to +3dB
        // NOTE: Do not set legacy "wire" macro to avoid double-application
        // Legacy macro is read separately in engine if needed
    }
    if (envelopeParams.noise_decay_ms !== undefined) {
        backendParams["snare"] = backendParams["snare"] || {};
        backendParams["snare"]["wires"] = backendParams["snare"]["wires"] || {};
        backendParams["snare"]["wires"]["amp"] = backendParams["snare"]["wires"]["amp"] || {};
        backendParams["snare"]["wires"]["amp"]["decay_ms"] = envelopeParams.noise_decay_ms;
    }
    if (envelopeParams.noise_band_center_hz !== undefined) {
        backendParams["snare"] = backendParams["snare"] || {};
        backendParams["snare"]["wires"] = backendParams["snare"]["wires"] || {};
        backendParams["snare"]["wires"]["filter_hz"] = envelopeParams.noise_band_center_hz;
    }

    // SNAP envelope -> snare.exciter_body.* or snare.exciter_air.*
    if (envelopeParams.snap_amount_pct !== undefined) {
        const pct = envelopeParams.snap_amount_pct / 100;
        backendParams["snare"] = backendParams["snare"] || {};
        backendParams["snare"]["exciter_body"] = backendParams["snare"]["exciter_body"] || {};
        backendParams["snare"]["exciter_body"]["gain_db"] = pct > 0 ? -6 + (pct * 6) : -200;
        // NOTE: Do not set legacy "crack" macro to avoid double-application
        // Legacy macro is read separately in engine if needed
    }
    if (envelopeParams.snap_decay_ms !== undefined) {
        backendParams["snare"] = backendParams["snare"] || {};
        backendParams["snare"]["exciter_body"] = backendParams["snare"]["exciter_body"] || {};
        backendParams["snare"]["exciter_body"]["amp"] = backendParams["snare"]["exciter_body"]["amp"] || {};
        backendParams["snare"]["exciter_body"]["amp"]["decay_ms"] = envelopeParams.snap_decay_ms;
    }
    if (envelopeParams.snap_tone_hz !== undefined) {
        backendParams["snare"] = backendParams["snare"] || {};
        backendParams["snare"]["exciter_body"] = backendParams["snare"]["exciter_body"] || {};
        backendParams["snare"]["exciter_body"]["filter_hz"] = envelopeParams.snap_tone_hz;
    }

    return backendParams;
}
