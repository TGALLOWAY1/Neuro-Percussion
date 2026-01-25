export type InstrumentType = 'kick' | 'snare' | 'hat';
export type RenderStyle = 'clean' | 'gritty' | 'aggro' | 'airy';

export interface RenderContext {
    instrument: InstrumentType;
    style: RenderStyle;
    quality: 'draft' | 'high';
}

export interface Candidate {
    id: string;
    seed: number;
    dsp_params: Record<string, number>;
    audioUrl?: string; // Blob URL
}

// UI State
export interface InstrumentState {
    currentCandidate: Candidate | null;
    history: Candidate[];
    liked: Candidate[];
    macros: MacroDefinition[];
}

export interface MacroDefinition {
    id: string; // matches backend param key
    label: string;
    min: number;
    max: number;
    defaultValue: number;
}
