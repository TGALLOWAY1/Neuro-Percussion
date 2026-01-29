/**
 * Maps Snare envelope UI parameters to backend engine parameters.
 * Uses unit conversion helpers to ensure correct scaling and prevent double-conversion.
 * Returns consumed param ids for coverage checks.
 */

import { pctToDbLinear } from "../units";

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

export interface MapSnareResult {
    result: Record<string, unknown>;
    consumed: string[];
}

/**
 * Maps Snare envelope params to backend format.
 * Returns result and list of envelope param ids that were consumed.
 */
export function mapSnareParams(envelopeParams: SnareEnvelopeParams): MapSnareResult {
    const backendParams: Record<string, unknown> = {};
    const consumed: string[] = [];

    // AMP envelope -> snare.shell.amp.* (main body)
    if (envelopeParams.attack_ms !== undefined) {
        if (!backendParams["snare"]) backendParams["snare"] = {};
        const snare = backendParams["snare"] as Record<string, unknown>;
        if (!snare["shell"]) snare["shell"] = {};
        const shell = snare["shell"] as Record<string, unknown>;
        if (!shell["amp"]) shell["amp"] = {};
        (shell["amp"] as Record<string, unknown>)["attack_ms"] = envelopeParams.attack_ms;
        consumed.push("attack_ms");
    }
    if (envelopeParams.decay_ms !== undefined) {
        if (!backendParams["snare"]) backendParams["snare"] = {};
        const snare = backendParams["snare"] as Record<string, unknown>;
        if (!snare["shell"]) snare["shell"] = {};
        const shell = snare["shell"] as Record<string, unknown>;
        if (!shell["amp"]) shell["amp"] = {};
        (shell["amp"] as Record<string, unknown>)["decay_ms"] = envelopeParams.decay_ms;
        consumed.push("decay_ms");
    }

    // BODY envelope -> snare.shell.*
    if (envelopeParams.body_pitch_hz !== undefined) {
        if (!backendParams["snare"]) backendParams["snare"] = {};
        const snare = backendParams["snare"] as Record<string, unknown>;
        if (!snare["shell"]) snare["shell"] = {};
        (snare["shell"] as Record<string, unknown>)["pitch_hz"] = envelopeParams.body_pitch_hz;
        consumed.push("body_pitch_hz");
    }
    if (envelopeParams.body_decay_ms !== undefined) {
        if (!backendParams["snare"]) backendParams["snare"] = {};
        const snare = backendParams["snare"] as Record<string, unknown>;
        if (!snare["shell"]) snare["shell"] = {};
        const shell = snare["shell"] as Record<string, unknown>;
        if (!shell["amp"]) shell["amp"] = {};
        (shell["amp"] as Record<string, unknown>)["decay_ms"] = envelopeParams.body_decay_ms;
        consumed.push("body_decay_ms");
    }
    if (envelopeParams.body_amount_pct !== undefined) {
        const gain_db = pctToDbLinear(envelopeParams.body_amount_pct, -6, 0);
        if (!backendParams["snare"]) backendParams["snare"] = {};
        const snare = backendParams["snare"] as Record<string, unknown>;
        if (!snare["shell"]) snare["shell"] = {};
        (snare["shell"] as Record<string, unknown>)["gain_db"] = gain_db;
        consumed.push("body_amount_pct");
    }

    // NOISE envelope -> snare.wires.*
    if (envelopeParams.noise_amount_pct !== undefined) {
        const gain_db = pctToDbLinear(envelopeParams.noise_amount_pct, -18, 3);
        if (!backendParams["snare"]) backendParams["snare"] = {};
        const snare = backendParams["snare"] as Record<string, unknown>;
        if (!snare["wires"]) snare["wires"] = {};
        (snare["wires"] as Record<string, unknown>)["gain_db"] = gain_db;
        consumed.push("noise_amount_pct");
    }
    if (envelopeParams.noise_decay_ms !== undefined) {
        if (!backendParams["snare"]) backendParams["snare"] = {};
        const snare = backendParams["snare"] as Record<string, unknown>;
        if (!snare["wires"]) snare["wires"] = {};
        const wires = snare["wires"] as Record<string, unknown>;
        if (!wires["amp"]) wires["amp"] = {};
        (wires["amp"] as Record<string, unknown>)["decay_ms"] = envelopeParams.noise_decay_ms;
        consumed.push("noise_decay_ms");
    }
    if (envelopeParams.noise_band_center_hz !== undefined) {
        if (!backendParams["snare"]) backendParams["snare"] = {};
        const snare = backendParams["snare"] as Record<string, unknown>;
        if (!snare["wires"]) snare["wires"] = {};
        (snare["wires"] as Record<string, unknown>)["filter_hz"] = envelopeParams.noise_band_center_hz;
        consumed.push("noise_band_center_hz");
    }

    // SNAP envelope -> snare.exciter_body.*
    if (envelopeParams.snap_amount_pct !== undefined) {
        const gain_db = pctToDbLinear(envelopeParams.snap_amount_pct, -6, 0);
        if (!backendParams["snare"]) backendParams["snare"] = {};
        const snare = backendParams["snare"] as Record<string, unknown>;
        if (!snare["exciter_body"]) snare["exciter_body"] = {};
        (snare["exciter_body"] as Record<string, unknown>)["gain_db"] = gain_db;
        consumed.push("snap_amount_pct");
    }
    if (envelopeParams.snap_decay_ms !== undefined) {
        if (!backendParams["snare"]) backendParams["snare"] = {};
        const snare = backendParams["snare"] as Record<string, unknown>;
        if (!snare["exciter_body"]) snare["exciter_body"] = {};
        const exc = snare["exciter_body"] as Record<string, unknown>;
        if (!exc["amp"]) exc["amp"] = {};
        (exc["amp"] as Record<string, unknown>)["decay_ms"] = envelopeParams.snap_decay_ms;
        consumed.push("snap_decay_ms");
    }
    if (envelopeParams.snap_tone_hz !== undefined) {
        if (!backendParams["snare"]) backendParams["snare"] = {};
        const snare = backendParams["snare"] as Record<string, unknown>;
        if (!snare["exciter_body"]) snare["exciter_body"] = {};
        (snare["exciter_body"] as Record<string, unknown>)["filter_hz"] = envelopeParams.snap_tone_hz;
        consumed.push("snap_tone_hz");
    }

    return { result: backendParams, consumed };
}
