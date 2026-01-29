/**
 * Tests for snare oneshot mode parameter mapping.
 */

import { mapSnareParams } from "../mapSnareParams";

describe("Snare Oneshot Mode", () => {
    it("does not set legacy macros to avoid double-application", () => {
        const envelopeParams = {
            noise_amount_pct: 55,
            snap_amount_pct: 35,
        };

        const { result } = mapSnareParams(envelopeParams);

        // Should NOT set legacy "wire" or "crack" macros
        expect(result["wire"]).toBeUndefined();
        expect(result["crack"]).toBeUndefined();

        // Should set nested params instead
        expect(result["snare"]["wires"]["gain_db"]).toBeDefined();
        expect(result["snare"]["exciter_body"]["gain_db"]).toBeDefined();
    });

    it("maps envelope params to nested backend format", () => {
        const envelopeParams = {
            attack_ms: 1,
            decay_ms: 320,
            body_pitch_hz: 200,
            noise_decay_ms: 280,
        };

        const { result } = mapSnareParams(envelopeParams);

        expect(result["snare"]["shell"]["amp"]["attack_ms"]).toBe(1);
        expect(result["snare"]["shell"]["amp"]["decay_ms"]).toBe(320);
        expect(result["snare"]["shell"]["pitch_hz"]).toBe(200);
        expect(result["snare"]["wires"]["amp"]["decay_ms"]).toBe(280);
    });
});
