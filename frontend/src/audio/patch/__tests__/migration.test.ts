/**
 * Tests for patch migration system.
 */

import { migratePatchToV1, validateCanonicalPatch, type PatchV0, type PatchV1 } from "../migration";

describe("Patch Migration", () => {
    describe("migratePatchToV1", () => {
        it("migrates V0 patch to V1", () => {
            const v0Patch: PatchV0 = {
                params: { tone: 0.5, wire: 0.4 },
                seed: 42,
            };

            const v1Patch = migratePatchToV1(v0Patch);

            expect(v1Patch.schemaVersion).toBe(1);
            expect(v1Patch.params).toEqual({ tone: 0.5, wire: 0.4 });
            expect(v1Patch.seed).toBe(42);
            expect(v1Patch.envelopeParams).toEqual({});
            expect(v1Patch.repeatMode).toBe("oneshot");
            expect(v1Patch.roomEnabled).toBe(false);
        });

        it("leaves V1 patch unchanged", () => {
            const v1Patch: PatchV1 = {
                schemaVersion: 1,
                params: { tone: 0.5 },
                envelopeParams: { attack_ms: 1 },
                seed: 42,
                repeatMode: "oneshot",
                roomEnabled: false,
            };

            const result = migratePatchToV1(v1Patch);

            expect(result).toEqual(v1Patch);
        });

        it("disables delay/room for legacy patches with delay params", () => {
            const v0Patch: PatchV0 = {
                params: {
                    tone: 0.5,
                    delayMix: 0.3, // Legacy delay param
                    roomMix: 0.2, // Legacy room param
                },
                seed: 42,
            };

            const v1Patch = migratePatchToV1(v0Patch);

            expect(v1Patch.repeatMode).toBe("oneshot");
            expect(v1Patch.roomEnabled).toBe(false);
        });

        it("handles missing params gracefully", () => {
            const v0Patch: PatchV0 = {
                seed: 42,
            };

            const v1Patch = migratePatchToV1(v0Patch);

            expect(v1Patch.params).toEqual({});
            expect(v1Patch.seed).toBe(42);
        });
    });

    describe("validateCanonicalPatch", () => {
        it("returns no warnings for clean V1 patch", () => {
            const patch: PatchV1 = {
                schemaVersion: 1,
                params: { tone: 0.5 },
                seed: 42,
            };

            const warnings = validateCanonicalPatch(patch);

            expect(warnings).toEqual([]);
        });

        it("warns about deprecated delay fields", () => {
            const patch: PatchV1 = {
                schemaVersion: 1,
                params: {
                    tone: 0.5,
                    delayMix: 0.3, // Deprecated
                },
                seed: 42,
            };

            const warnings = validateCanonicalPatch(patch);

            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain("delayMix");
        });
    });
});
