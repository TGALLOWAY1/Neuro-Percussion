import type { InstrumentType } from "@/types";
import type { EngineParams } from "@/audio/contract";

const API_BASE = "http://127.0.0.1:8000";


export async function generateAudio(
    instrument: InstrumentType,
    params: EngineParams,
    seed: number
): Promise<Blob> {
    const response = await fetch(`${API_BASE}/generate/${instrument}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            ...params,
            seed,
        }),
    });

    if (!response.ok) {
        throw new Error(`Generation failed (${response.status}): ${response.statusText}`);
    }

    return response.blob();
}

export async function sendFeedback(
    instrument: InstrumentType,
    params: Record<string, number>,
    seed: number,
    label: 0 | 1
): Promise<void> {
    const response = await fetch(`${API_BASE}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument, params, seed, label })
    });

    if (!response.ok) {
        throw new Error(`Feedback failed (${response.status}): ${response.statusText}`);
    }
}

export async function proposeParams(instrument: InstrumentType): Promise<Record<string, number>> {
    const res = await fetch(`${API_BASE}/propose/${instrument}`);
    if (!res.ok) throw new Error(`Propose failed (${res.status}): ${res.statusText}`);
    return res.json();
}

export interface KitExportData {
    name: string;
    slots: Record<string, unknown>;
}

export async function exportKit(kitData: KitExportData): Promise<Blob> {
    const res = await fetch(`${API_BASE}/export/kit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kitData)
    });
    if (!res.ok) throw new Error(`Export failed (${res.status}): ${res.statusText}`);
    return res.blob();
}

/**
 * Request a high-quality WAV render from the server.
 * Same params as generateAudio but with quality: "high" flag.
 */
export async function renderHighQuality(
    instrument: InstrumentType,
    params: EngineParams,
    seed: number
): Promise<Blob> {
    const response = await fetch(`${API_BASE}/generate/${instrument}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            ...params,
            seed,
            quality: "high",
        }),
    });
    if (!response.ok) {
        throw new Error(`High-quality render failed (${response.status}): ${response.statusText}`);
    }
    return response.blob();
}
