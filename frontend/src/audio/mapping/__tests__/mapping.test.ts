/**
 * Lightweight tests for parameter mapping functions.
 * Verifies unit conversions and boundary cases.
 */

import { mapKickParams } from "../mapKickParams";
import { mapSnareParams } from "../mapSnareParams";
import { mapHatParams } from "../mapHatParams";
import { pctToDbLinear, pctToLinear } from "../../units";

describe("Parameter Mapping", () => {
    describe("mapKickParams", () => {
        it("maps AMP envelope params to backend format", () => {
            const { result } = mapKickParams({
                attack_ms: 2,
                decay_ms: 300,
            });

            expect(result.kick?.sub?.amp?.attack_ms).toBe(2);
            expect(result.kick?.sub?.amp?.decay_ms).toBe(300);
        });

        it("maps PITCH envelope params", () => {
            const { result } = mapKickParams({
                start_pitch_st: 24,
                pitch_decay_ms: 60,
            });

            expect(result.kick?.pitch_env?.semitones).toBe(24);
            expect(result.kick?.pitch_env?.decay_ms).toBe(60);
        });

        it("maps CLICK envelope params", () => {
            const { result } = mapKickParams({
                click_amount_pct: 50,
                click_decay_ms: 12,
            });

            expect(result.kick?.click?.gain_db).toBeGreaterThan(-24);
            expect(result.kick?.click?.amp?.decay_ms).toBe(12);
            expect(result.click_amount).toBe(0.5);
        });

        it("converts click_amount_pct correctly (boundary cases)", () => {
            // 0% -> mute (-200dB)
            const { result: result0 } = mapKickParams({ click_amount_pct: 0 });
            expect(result0.kick?.click?.gain_db).toBe(-200);
            expect(result0.click_amount).toBe(0);

            // 100% -> 0dB
            const { result: result100 } = mapKickParams({ click_amount_pct: 100 });
            expect(result100.kick?.click?.gain_db).toBeCloseTo(0, 2);
            expect(result100.click_amount).toBe(1);

            // 50% -> -12dB (midpoint)
            const { result: result50 } = mapKickParams({ click_amount_pct: 50 });
            expect(result50.kick?.click?.gain_db).toBeCloseTo(-12, 2);
            expect(result50.click_amount).toBe(0.5);
        });
    });

    describe("mapSnareParams", () => {
        it("maps AMP envelope params", () => {
            const { result } = mapSnareParams({
                attack_ms: 1,
                decay_ms: 320,
            });

            expect(result.snare?.shell?.amp?.attack_ms).toBe(1);
            expect(result.snare?.shell?.amp?.decay_ms).toBe(320);
        });

        it("maps BODY envelope params", () => {
            const { result } = mapSnareParams({
                body_pitch_hz: 200,
                body_decay_ms: 180,
            });

            expect(result.snare?.shell?.pitch_hz).toBe(200);
            expect(result.snare?.shell?.amp?.decay_ms).toBe(180);
        });

        it("maps NOISE envelope params", () => {
            const { result } = mapSnareParams({
                noise_amount_pct: 55,
                noise_decay_ms: 280,
            });

            expect(result.snare?.wires?.gain_db).toBeGreaterThan(-18);
            expect(result.snare?.wires?.amp?.decay_ms).toBe(280);
            // Legacy "wire" macro is intentionally not set (see mapSnareParams)
            expect(result.wire).toBeUndefined();
        });

        it("converts noise_amount_pct correctly (boundary cases)", () => {
            // 0% -> mute (-200dB)
            const { result: result0 } = mapSnareParams({ noise_amount_pct: 0 });
            expect(result0.snare?.wires?.gain_db).toBe(-200);

            // 100% -> +3dB
            const { result: result100 } = mapSnareParams({ noise_amount_pct: 100 });
            expect(result100.snare?.wires?.gain_db).toBeCloseTo(3, 2);

            // 50% -> midpoint between -18dB and +3dB
            const { result: result50 } = mapSnareParams({ noise_amount_pct: 50 });
            expect(result50.snare?.wires?.gain_db).toBeCloseTo(-7.5, 2);
        });
    });

    describe("mapHatParams", () => {
        it("maps AMP envelope params", () => {
            const { result } = mapHatParams({
                attack_ms: 0.5,
                decay_ms: 90,
            });

            expect(result.hat?.metal?.amp?.attack_ms).toBe(0.5);
            expect(result.hat?.metal?.amp?.decay_ms).toBe(90);
        });

        it("maps METAL envelope params", () => {
            const { result } = mapHatParams({
                metal_amount_pct: 65,
                inharmonicity: 0.55,
            });

            expect(result.hat?.metal?.gain_db).toBeGreaterThan(-12);
            expect(result.hat?.metal?.ratio_jitter).toBe(0.55);
        });

        it("maps NOISE envelope params", () => {
            const { result } = mapHatParams({
                noise_amount_pct: 45,
                hpf_cutoff_hz: 6000,
            });

            expect(result.hat?.air?.gain_db).toBeGreaterThan(-12);
            expect(result.hat?.hpf_hz).toBe(6000);
            expect(result.sheen).toBe(0.45);
        });

        it("maps choke flag", () => {
            const { result } = mapHatParams({
                choke: 1,
            });

            expect(result.hat?.choke_group).toBe(true);
        });

        it("converts width_pct correctly (boundary cases)", () => {
            // 0% -> 0.0
            const { result: result0 } = mapHatParams({ width_pct: 0 });
            expect(result0.hat?.stereo?.width).toBe(0);

            // 100% -> 1.0
            const { result: result100 } = mapHatParams({ width_pct: 100 });
            expect(result100.hat?.stereo?.width).toBe(1);

            // 150% -> 1.5 (max width)
            const { result: result150 } = mapHatParams({ width_pct: 150 });
            expect(result150.hat?.stereo?.width).toBe(1.5);
        });

        it("converts metal_amount_pct correctly (boundary cases)", () => {
            // 0% -> mute (-200dB)
            const { result: result0 } = mapHatParams({ metal_amount_pct: 0 });
            expect(result0.hat?.metal?.gain_db).toBe(-200);

            // 100% -> 0dB
            const { result: result100 } = mapHatParams({ metal_amount_pct: 100 });
            expect(result100.hat?.metal?.gain_db).toBeCloseTo(0, 2);
        });
    });
});
