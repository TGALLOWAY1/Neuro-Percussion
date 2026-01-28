/**
 * Maps Kick envelope UI parameters to backend engine parameters.
 * Converts new envelope params (AMP, PITCH, CLICK) to nested backend format.
 */

export interface KickEnvelopeParams {
    // AMP envelope
    attack_ms?: number;
    hold_ms?: number;
    decay_ms?: number;
    curve?: number;
    
    // PITCH envelope
    start_pitch_st?: number;
    pitch_decay_ms?: number;
    pitch_curve?: number;
    end_pitch_offset_st?: number;
    
    // CLICK envelope
    click_amount_pct?: number;
    click_attack_ms?: number;
    click_decay_ms?: number;
    click_tone_hz?: number;
    snap?: number;
}

/**
 * Maps Kick envelope params to backend format.
 * Returns a flat dict compatible with backend's nested param structure.
 */
export function mapKickParams(envelopeParams: KickEnvelopeParams): Record<string, any> {
    const backendParams: Record<string, any> = {};

    // AMP envelope -> kick.sub.amp.* (main body)
    if (envelopeParams.attack_ms !== undefined) {
        backendParams["kick"] = backendParams["kick"] || {};
        backendParams["kick"]["sub"] = backendParams["kick"]["sub"] || {};
        backendParams["kick"]["sub"]["amp"] = backendParams["kick"]["sub"]["amp"] || {};
        backendParams["kick"]["sub"]["amp"]["attack_ms"] = envelopeParams.attack_ms;
    }
    if (envelopeParams.decay_ms !== undefined) {
        backendParams["kick"] = backendParams["kick"] || {};
        backendParams["kick"]["sub"] = backendParams["kick"]["sub"] || {};
        backendParams["kick"]["sub"]["amp"] = backendParams["kick"]["sub"]["amp"] || {};
        backendParams["kick"]["sub"]["amp"]["decay_ms"] = envelopeParams.decay_ms;
    }
    if (envelopeParams.hold_ms !== undefined) {
        // Hold maps to a short sustain or extended attack
        // For now, approximate by extending attack slightly
        backendParams["kick"] = backendParams["kick"] || {};
        backendParams["kick"]["sub"] = backendParams["kick"]["sub"] || {};
        backendParams["kick"]["sub"]["amp"] = backendParams["kick"]["sub"]["amp"] || {};
        // Note: Backend ADSR doesn't have explicit "hold", but we can approximate
        // by setting a very short sustain period
        backendParams["kick"]["sub"]["amp"]["sustain"] = 0.0; // No sustain for kick
    }

    // PITCH envelope -> kick.pitch_env.*
    if (envelopeParams.start_pitch_st !== undefined || envelopeParams.pitch_decay_ms !== undefined) {
        backendParams["kick"] = backendParams["kick"] || {};
        backendParams["kick"]["pitch_env"] = backendParams["kick"]["pitch_env"] || {};
        if (envelopeParams.start_pitch_st !== undefined) {
            backendParams["kick"]["pitch_env"]["semitones"] = envelopeParams.start_pitch_st;
        }
        if (envelopeParams.pitch_decay_ms !== undefined) {
            backendParams["kick"]["pitch_env"]["decay_ms"] = envelopeParams.pitch_decay_ms;
        }
    }

    // CLICK envelope -> kick.click.*
    if (envelopeParams.click_amount_pct !== undefined) {
        // Convert percentage to gain_db (0-100% -> -24dB to 0dB perceptual curve)
        const pct = envelopeParams.click_amount_pct / 100;
        const gain_db = pct > 0 ? -24 + (pct * 24) : -200; // Mute if 0
        backendParams["kick"] = backendParams["kick"] || {};
        backendParams["kick"]["click"] = backendParams["kick"]["click"] || {};
        backendParams["kick"]["click"]["gain_db"] = gain_db;
        // Also map to legacy click_amount macro (0-1 range)
        backendParams["click_amount"] = pct;
    }
    if (envelopeParams.click_attack_ms !== undefined) {
        backendParams["kick"] = backendParams["kick"] || {};
        backendParams["kick"]["click"] = backendParams["kick"]["click"] || {};
        backendParams["kick"]["click"]["amp"] = backendParams["kick"]["click"]["amp"] || {};
        backendParams["kick"]["click"]["amp"]["attack_ms"] = envelopeParams.click_attack_ms;
    }
    if (envelopeParams.click_decay_ms !== undefined) {
        backendParams["kick"] = backendParams["kick"] || {};
        backendParams["kick"]["click"] = backendParams["kick"]["click"] || {};
        backendParams["kick"]["click"]["amp"] = backendParams["kick"]["click"]["amp"] || {};
        backendParams["kick"]["click"]["amp"]["decay_ms"] = envelopeParams.click_decay_ms;
    }
    if (envelopeParams.click_tone_hz !== undefined) {
        // Map to click filter frequency (if backend supports it)
        // For now, store as a custom param that backend can read
        backendParams["kick"] = backendParams["kick"] || {};
        backendParams["kick"]["click"] = backendParams["kick"]["click"] || {};
        backendParams["kick"]["click"]["filter_hz"] = envelopeParams.click_tone_hz;
    }
    if (envelopeParams.snap !== undefined) {
        // Map to legacy click_snap macro
        backendParams["click_snap"] = envelopeParams.snap;
    }

    return backendParams;
}
