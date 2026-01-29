/**
 * Machine-readable parameter spec derived from NotebookLM / RESEARCH_GUIDANCE.md.
 * Defines default, range, unit, and gating rules for kick/snare/hat + QC.
 * Source: docs/RESEARCH_GUIDANCE.md
 */

export type ResearchParamUnit = "ms" | "hz" | "st" | "pct" | "db" | "linear" | "bool";

export interface ResearchParamEntry {
  id: string;
  unit: ResearchParamUnit;
  min: number;
  max: number;
  default: number;
  notes?: string;
}

export type ResearchSpecInstrument = "kick" | "snare" | "hat";

/** Research spec: instrument -> param id -> entry */
export type ResearchParamSpec = Record<ResearchSpecInstrument, Record<string, ResearchParamEntry>>;

/**
 * NotebookLM-derived spec. Param ids align with implementation where possible
 * (spec_kick, spec_snare, spec_hat and backend keys).
 */
export const RESEARCH_PARAM_SPEC: ResearchParamSpec = {
  kick: {
    // Transient layer
    click_amount_pct: { id: "click_amount_pct", unit: "pct", min: 0, max: 100, default: 50, notes: "Click Level 0-1 linear -> pct" },
    click_attack_ms: { id: "click_attack_ms", unit: "ms", min: 0, max: 5, default: 0.5, notes: "Attack (Snap) 0-5ms" },
    click_tone_hz: { id: "click_tone_hz", unit: "hz", min: 200, max: 16000, default: 6000, notes: "Click Filter 200Hz-16kHz, 5-8kHz typical" },
    snap: { id: "snap", unit: "linear", min: 0, max: 1, default: 0.6, notes: "Hardness 0-1" },
    // Body layer
    start_pitch_st: { id: "start_pitch_st", unit: "st", min: 0, max: 100, default: 24, notes: "Pitch Env Amount 0-100st" },
    pitch_decay_ms: { id: "pitch_decay_ms", unit: "ms", min: 10, max: 300, default: 50, notes: "Pitch Decay 10-300ms" },
    decay_ms: { id: "decay_ms", unit: "ms", min: 150, max: 800, default: 350, notes: "Amp Decay 150-800ms" },
    attack_ms: { id: "attack_ms", unit: "ms", min: 0, max: 10, default: 0, notes: "Global attack 0-10ms" },
    hold_ms: { id: "hold_ms", unit: "ms", min: 0, max: 30, default: 5, notes: "Optional hold" },
    curve: { id: "curve", unit: "linear", min: 0.2, max: 3, default: 1.6, notes: "Envelope curve" },
    end_pitch_offset_st: { id: "end_pitch_offset_st", unit: "st", min: -12, max: 12, default: 0, notes: "End pitch offset" },
    pitch_curve: { id: "pitch_curve", unit: "linear", min: 0.2, max: 3, default: 1.3, notes: "Pitch envelope curve" },
    click_decay_ms: { id: "click_decay_ms", unit: "ms", min: 1, max: 60, default: 12, notes: "Click decay" },
  },
  snare: {
    // Tonal body
    body_pitch_hz: { id: "body_pitch_hz", unit: "hz", min: 120, max: 250, default: 200, notes: "Tune 120-250Hz" },
    body_decay_ms: { id: "body_decay_ms", unit: "ms", min: 50, max: 400, default: 150, notes: "Tone Decay 50-400ms" },
    body_amount_pct: { id: "body_amount_pct", unit: "pct", min: 0, max: 100, default: 45, notes: "Body amount" },
    // Noise / wires
    noise_amount_pct: { id: "noise_amount_pct", unit: "pct", min: 0, max: 100, default: 60, notes: "Snare Level 0-1 -> 60%" },
    noise_decay_ms: { id: "noise_decay_ms", unit: "ms", min: 100, max: 600, default: 250, notes: "Noise Decay 100-600ms" },
    noise_band_center_hz: { id: "noise_band_center_hz", unit: "hz", min: 1000, max: 10000, default: 5000, notes: "Wire Filter 1-10kHz" },
    noise_color: { id: "noise_color", unit: "linear", min: 0, max: 1, default: 0.6, notes: "Pink/white balance" },
    noise_band_q: { id: "noise_band_q", unit: "linear", min: 0.3, max: 5, default: 1.2, notes: "Band Q" },
    // Global / snap
    attack_ms: { id: "attack_ms", unit: "ms", min: 0, max: 10, default: 1, notes: "Snap/Attack 0-10ms default 1" },
    decay_ms: { id: "decay_ms", unit: "ms", min: 40, max: 2000, default: 320, notes: "Amp decay" },
    curve: { id: "curve", unit: "linear", min: 0.2, max: 3, default: 1.4, notes: "Envelope curve" },
    snap_amount_pct: { id: "snap_amount_pct", unit: "pct", min: 0, max: 100, default: 35, notes: "Snap amount" },
    snap_decay_ms: { id: "snap_decay_ms", unit: "ms", min: 1, max: 40, default: 10, notes: "Snap decay" },
    snap_tone_hz: { id: "snap_tone_hz", unit: "hz", min: 1500, max: 12000, default: 7000, notes: "Snap/crack tone 5-8kHz region" },
  },
  hat: {
    // Core tone
    metal_amount_pct: { id: "metal_amount_pct", unit: "pct", min: 0, max: 100, default: 65, notes: "Metal amount" },
    inharmonicity: { id: "inharmonicity", unit: "linear", min: 0, max: 1, default: 0.7, notes: "Dissonance 0-1" },
    brightness_hz: { id: "brightness_hz", unit: "hz", min: 300, max: 16000, default: 8000, notes: "Metal Pitch 300-10k / Color 2k-15k; 8k typical" },
    // Filtering
    hpf_cutoff_hz: { id: "hpf_cutoff_hz", unit: "hz", min: 300, max: 12000, default: 3000, notes: "HP 300-8kHz default 3kHz" },
    // Envelope
    decay_ms: { id: "decay_ms", unit: "ms", min: 20, max: 2000, default: 80, notes: "Decay 20-2000ms default 80" },
    attack_ms: { id: "attack_ms", unit: "ms", min: 0, max: 3, default: 0.5, notes: "Attack" },
    curve: { id: "curve", unit: "linear", min: 0.2, max: 3, default: 1.2, notes: "Envelope curve" },
    choke: { id: "choke", unit: "bool", min: 0, max: 1, default: 1, notes: "Choke group default On" },
    noise_amount_pct: { id: "noise_amount_pct", unit: "pct", min: 0, max: 100, default: 45, notes: "Noise layer" },
    noise_color: { id: "noise_color", unit: "linear", min: 0, max: 1, default: 0.75, notes: "Noise color" },
    width_pct: { id: "width_pct", unit: "pct", min: 0, max: 150, default: 110, notes: "Stereo width" },
    micro_delay_ms: { id: "micro_delay_ms", unit: "ms", min: 0, max: 20, default: 6, notes: "Micro delay" },
    air_pct: { id: "air_pct", unit: "pct", min: 0, max: 40, default: 10, notes: "Air" },
  },
};

/** All param ids that appear in the research spec (for validation). */
export function getAllResearchParamIds(): Record<ResearchSpecInstrument, string[]> {
  return {
    kick: Object.keys(RESEARCH_PARAM_SPEC.kick),
    snare: Object.keys(RESEARCH_PARAM_SPEC.snare),
    hat: Object.keys(RESEARCH_PARAM_SPEC.hat),
  };
}
