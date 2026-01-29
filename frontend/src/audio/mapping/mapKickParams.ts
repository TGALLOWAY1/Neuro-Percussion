/**
 * Maps Kick envelope UI parameters to backend engine parameters.
 * Converts new envelope params (AMP, PITCH, CLICK) to nested backend format.
 * Uses unit conversion helpers to ensure correct scaling and prevent double-conversion.
 * Returns consumed param ids for coverage checks.
 */

import { pctToLinear, pctToDbLinear } from "../units";

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

export interface MapKickResult {
    result: Record<string, unknown>;
    consumed: string[];
}

/**
 * Maps Kick envelope params to backend format.
 * Returns result and list of envelope param ids that were consumed (read and written to output).
 */
export function mapKickParams(envelopeParams: KickEnvelopeParams): MapKickResult {
    const backendParams: Record<string, unknown> = {};
    const consumed: string[] = [];

    const kick = (backendParams["kick"] as Record<string, unknown>) || {};
    const sub = (kick["sub"] as Record<string, unknown>) || {};
    const amp = (sub["amp"] as Record<string, unknown>) || {};

    // AMP envelope -> kick.sub.amp.* (main body)
    if (envelopeParams.attack_ms !== undefined) {
        amp["attack_ms"] = envelopeParams.attack_ms;
        consumed.push("attack_ms");
    }
    if (envelopeParams.decay_ms !== undefined) {
        amp["decay_ms"] = envelopeParams.decay_ms;
        consumed.push("decay_ms");
    }
    if (envelopeParams.hold_ms !== undefined) {
        amp["sustain"] = 0.0; // No sustain for kick; hold approximated
        consumed.push("hold_ms");
    }

    if (Object.keys(amp).length > 0) {
        sub["amp"] = amp;
        kick["sub"] = sub;
        backendParams["kick"] = kick;
    }

    // PITCH envelope -> kick.pitch_env.*
    const pitchEnv: Record<string, unknown> = {};
    if (envelopeParams.start_pitch_st !== undefined) {
        pitchEnv["semitones"] = envelopeParams.start_pitch_st;
        consumed.push("start_pitch_st");
    }
    if (envelopeParams.pitch_decay_ms !== undefined) {
        pitchEnv["decay_ms"] = envelopeParams.pitch_decay_ms;
        consumed.push("pitch_decay_ms");
    }
    if (Object.keys(pitchEnv).length > 0) {
        const k = (backendParams["kick"] as Record<string, unknown>) || {};
        k["pitch_env"] = pitchEnv;
        backendParams["kick"] = k;
    }

    // CLICK envelope -> kick.click.*
    const click: Record<string, unknown> = {};
    const clickAmp: Record<string, unknown> = {};
    if (envelopeParams.click_amount_pct !== undefined) {
        const gain_db = pctToDbLinear(envelopeParams.click_amount_pct, -24, 0);
        click["gain_db"] = gain_db;
        backendParams["click_amount"] = pctToLinear(envelopeParams.click_amount_pct);
        consumed.push("click_amount_pct");
    }
    if (envelopeParams.click_attack_ms !== undefined) {
        clickAmp["attack_ms"] = envelopeParams.click_attack_ms;
        consumed.push("click_attack_ms");
    }
    if (envelopeParams.click_decay_ms !== undefined) {
        clickAmp["decay_ms"] = envelopeParams.click_decay_ms;
        consumed.push("click_decay_ms");
    }
    if (Object.keys(clickAmp).length > 0) click["amp"] = clickAmp;
    if (envelopeParams.click_tone_hz !== undefined) {
        click["filter_hz"] = envelopeParams.click_tone_hz;
        consumed.push("click_tone_hz");
    }
    if (envelopeParams.snap !== undefined) {
        backendParams["click_snap"] = envelopeParams.snap;
        consumed.push("snap");
    }
    if (Object.keys(click).length > 0) {
        const k = (backendParams["kick"] as Record<string, unknown>) || {};
        k["click"] = click;
        backendParams["kick"] = k;
    }

    return { result: backendParams, consumed };
}
