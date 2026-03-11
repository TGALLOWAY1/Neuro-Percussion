/**
 * Shared types for the Zustand store slices.
 */
import type { InstrumentType } from "@/types";
import type { BezierEnvelope } from "@/audio/bezier";
import type { EngineParams } from "@/audio/contract";

export type LayerTab = "SUB" | "CLICK1" | "CLICK2" | "CLICK3";
export type EnvelopeViewMode = "PITCH" | "AMP";
export type MutationFocus = "all" | "amp" | "pitch" | "click" | "body" | "noise" | "snap" | "macros";

export interface KitSlot {
  schemaVersion: 1;
  params: Record<string, number>;
  envelopeParams: Record<string, number>;
  seed: number;
  repeatMode?: "oneshot" | "roll" | "echo";
  roomEnabled?: boolean;
}

// --- Slice state shapes ---

export interface AudioState {
  instrument: InstrumentType;
  params: Record<string, number>;
  envelopeParams: Record<string, number>;
  seed: number;
  audioUrl: string | null;
  isLoading: boolean;
  error: string | null;
}

export interface AudioActions {
  switchInstrument: (inst: InstrumentType) => void;
  updateParam: (key: string, value: number) => void;
  updateEnvelopeParam: (paramId: string, value: number) => void;
  resetEnvelope: (envelopeId: string) => void;
  generate: (overrides?: {
    instrument?: InstrumentType;
    params?: Record<string, number>;
    seed?: number;
    engineParams?: EngineParams;
    envelopeParams?: Record<string, number>;
  }) => Promise<void>;
  nextSeed: () => void;
  clearError: () => void;
  saveWav: () => Promise<void>;
  _getEngineParams: (
    inst: InstrumentType,
    macroParams: Record<string, number>,
    envParams: Record<string, number>,
    seedVal: number,
    kitPatch?: KitSlot
  ) => EngineParams;
}

export interface MutationState {
  feedbackSent: number | null;
  mutationFocus: MutationFocus;
  mutationAmount: number;
  feedbackHistory: Array<{ instrument: InstrumentType; seed: number; label: number }>;
}

export interface MutationActions {
  submitFeedback: (label: number) => Promise<void>;
  aiSuggest: () => Promise<void>;
  rollDice: () => void;
  smartMutate: () => void;
  setMutationFocus: (focus: MutationFocus) => void;
  setMutationAmount: (amount: number) => void;
}

export interface EnvelopeState {
  bezierEnvelopes: Record<string, BezierEnvelope>;
  timingMs: number;
  activeLayer: LayerTab;
  envelopeMode: EnvelopeViewMode;
}

export interface EnvelopeActions {
  updateBezierEnvelope: (envelopeId: string, envelope: BezierEnvelope) => void;
  syncBezierFromParams: () => void;
  setTimingMs: (ms: number) => void;
  setActiveLayer: (layer: LayerTab) => void;
  setEnvelopeMode: (mode: EnvelopeViewMode) => void;
}

export interface KitState {
  kit: Partial<Record<InstrumentType, KitSlot>>;
  isExporting: boolean;
}

export interface KitActions {
  addToKit: () => void;
  exportCurrentKit: () => Promise<void>;
}

// Combined store type
export type PercussionState = AudioState & MutationState & EnvelopeState & KitState;
export type PercussionActions = AudioActions & MutationActions & EnvelopeActions & KitActions;
export type PercussionStore = PercussionState & PercussionActions;
