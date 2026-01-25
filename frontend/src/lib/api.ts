import { InstrumentType, Candidate } from "@/types";

const API_BASE = "http://localhost:8000";

export async function generateAudio(
    instrument: InstrumentType,
    params: Record<string, number>,
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
        throw new Error(`Generation failed: ${response.statusText}`);
    }

    return response.blob();
}

export async function sendFeedback(
    instrument: InstrumentType,
    params: Record<string, number>,
    seed: number,
    label: number // 1 or 0
) {
    await fetch(`${API_BASE}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument, params, seed, label })
    });
}

export async function proposeParams(instrument: InstrumentType): Promise<Record<string, number>> {
    const res = await fetch(`${API_BASE}/propose/${instrument}`);
    if (!res.ok) throw new Error("Propose failed");
    return res.json();
}

export async function exportKit(kitData: any): Promise<Blob> {
    const res = await fetch(`${API_BASE}/export/kit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kitData)
    });
    if (!res.ok) throw new Error("Export failed");
    return res.blob();
}
