/**
 * Patch schema versioning and migration system.
 * Ensures patches are migrated to the latest schema version before use.
 */

export interface PatchV0 {
    // Legacy patch format (no schemaVersion)
    params?: Record<string, number>;
    seed?: number;
}

export interface PatchV1 {
    schemaVersion: 1;
    params: Record<string, number>;
    envelopeParams?: Record<string, number>;
    seed: number;
    // Optional: repeat mode for snare
    repeatMode?: "oneshot" | "roll" | "echo";
    // Optional: room enabled flag
    roomEnabled?: boolean;
}

export type Patch = PatchV0 | PatchV1;

/**
 * Migrate a patch to the latest schema version (V1).
 * Legacy patches (missing schemaVersion) are assumed to be V0.
 */
export function migratePatchToV1(patch: Patch): PatchV1 {
    // Already V1
    if ("schemaVersion" in patch && patch.schemaVersion === 1) {
        return patch as PatchV1;
    }

    // V0 migration
    const v0Patch = patch as PatchV0;
    const v1Patch: PatchV1 = {
        schemaVersion: 1,
        params: v0Patch.params || {},
        envelopeParams: {}, // Will be initialized from defaults
        seed: v0Patch.seed || 42,
        repeatMode: "oneshot", // Default to oneshot for snare
        roomEnabled: false, // Default room disabled
    };

    // Check for deprecated delay/room params and disable them
    if (v0Patch.params) {
        // If legacy params suggest delay/room was enabled, explicitly disable
        const hasDelayParams = 
            "delayMix" in v0Patch.params ||
            "delayFeedback" in v0Patch.params ||
            "roomMix" in v0Patch.params ||
            "earlyReflections" in v0Patch.params;
        
        if (hasDelayParams) {
            console.warn("[PATCH MIGRATION] Legacy delay/room params detected, disabling for oneshot mode");
            // Explicitly set to oneshot mode
            v1Patch.repeatMode = "oneshot";
            v1Patch.roomEnabled = false;
        }
    }

    return v1Patch;
}

/**
 * Validate that a patch has only canonical fields (no legacy fields).
 * Returns warnings if both old and new fields exist.
 */
export function validateCanonicalPatch(patch: PatchV1): string[] {
    const warnings: string[] = [];

    // Check for deprecated fields that shouldn't exist in V1
    const deprecatedFields = [
        "delayMix",
        "delayFeedback",
        "roomMix",
        "earlyReflections",
        "predelay",
    ];

    for (const field of deprecatedFields) {
        if (field in patch.params) {
            warnings.push(`Deprecated field '${field}' found in V1 patch. Use repeatMode/roomEnabled instead.`);
        }
    }

    return warnings;
}
