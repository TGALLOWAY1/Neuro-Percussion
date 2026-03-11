/**
 * Core Zustand store for Neuro-Percussion.
 * Single source of truth for all app state. Replaces AuditionView's useState calls.
 *
 * Shape:
 *  - instrument: current instrument type
 *  - params: macro slider values
 *  - envelopeParams: envelope control values
 *  - seed: current random seed
 *  - audioUrl: blob URL for latest render
 *  - isLoading: server render in progress
 *  - feedbackSent: ML feedback state
 *  - kit: saved patches per instrument
 *  - isExporting: kit export in progress
 *  - activeLayer: current layer tab (SUB, CLICK1, CLICK2, CLICK3)
 *  - envelopeMode: PITCH or AMP view mode
 */

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { InstrumentType } from "@/types";
import {
  getMacroDefaults,
  getCanonicalEnvelopeDefaults,
  getRandomEnvelopeParams,
  getEnvelopeSpec,
} from "@/audio/params";
import {
  hydratePatchToCanonical,
  mapCanonicalToEngineParams,
  type CanonicalPatch,
  type EngineParams,
} from "@/audio/contract";
import { generateAudio, sendFeedback, proposeParams, exportKit } from "@/lib/api";

export type LayerTab = "SUB" | "CLICK1" | "CLICK2" | "CLICK3";
export type EnvelopeViewMode = "PITCH" | "AMP";

export interface KitSlot {
  schemaVersion: 1;
  params: Record<string, number>;
  envelopeParams: Record<string, number>;
  seed: number;
  repeatMode?: "oneshot" | "roll" | "echo";
  roomEnabled?: boolean;
}

export interface PercussionState {
  // Core synth state
  instrument: InstrumentType;
  params: Record<string, number>;
  envelopeParams: Record<string, number>;
  seed: number;

  // Audio output
  audioUrl: string | null;
  isLoading: boolean;

  // ML feedback
  feedbackSent: number | null;

  // Kit
  kit: Partial<Record<InstrumentType, KitSlot>>;
  isExporting: boolean;

  // Layout state (Phase 1)
  activeLayer: LayerTab;
  envelopeMode: EnvelopeViewMode;
}

export interface PercussionActions {
  // Instrument
  switchInstrument: (inst: InstrumentType) => void;

  // Parameters
  updateParam: (key: string, value: number) => void;
  updateEnvelopeParam: (paramId: string, value: number) => void;
  resetEnvelope: (envelopeId: string) => void;

  // Generation
  generate: (overrides?: {
    instrument?: InstrumentType;
    params?: Record<string, number>;
    seed?: number;
    engineParams?: EngineParams;
    envelopeParams?: Record<string, number>;
  }) => Promise<void>;
  nextSeed: () => void;

  // ML feedback
  submitFeedback: (label: number) => Promise<void>;
  aiSuggest: () => Promise<void>;

  // Kit
  addToKit: () => void;
  exportCurrentKit: () => Promise<void>;

  // Layout (Phase 1)
  setActiveLayer: (layer: LayerTab) => void;
  setEnvelopeMode: (mode: EnvelopeViewMode) => void;

  // Helpers (internal)
  _getEngineParams: (
    inst: InstrumentType,
    macroParams: Record<string, number>,
    envParams: Record<string, number>,
    seedVal: number,
    kitPatch?: KitSlot
  ) => EngineParams;
}

/** Debounce timer for parameter changes (not stored in Zustand) */
let _previewTimeout: ReturnType<typeof setTimeout> | null = null;
/** Debounce guard */
let _lastTriggerTime = 0;
const TRIGGER_DEBOUNCE_MS = 50;

export const usePercussionStore = create<PercussionState & PercussionActions>()(
  immer((set, get) => ({
    // Initial state
    instrument: "kick",
    params: getMacroDefaults("kick"),
    envelopeParams: getCanonicalEnvelopeDefaults("kick"),
    seed: 42,
    audioUrl: null,
    isLoading: false,
    feedbackSent: null,
    kit: {},
    isExporting: false,
    activeLayer: "SUB",
    envelopeMode: "AMP",

    // --- Helpers ---
    _getEngineParams: (inst, macroParams, envParams, seedVal, kitPatch) => {
      const patchLike = {
        schemaVersion: 1 as const,
        params: macroParams,
        envelopeParams: envParams,
        seed: seedVal,
        repeatMode: (kitPatch?.repeatMode as CanonicalPatch["repeatMode"]) ?? "oneshot",
        roomEnabled: kitPatch?.roomEnabled ?? false,
      };
      const canonical = hydratePatchToCanonical(patchLike, inst);
      return mapCanonicalToEngineParams(canonical);
    },

    // --- Instrument ---
    switchInstrument: (inst) => {
      const macroDefaults = getMacroDefaults(inst);
      const envDefaults = getCanonicalEnvelopeDefaults(inst);
      set((s) => {
        s.instrument = inst;
        s.params = macroDefaults;
        s.envelopeParams = envDefaults;
        s.feedbackSent = null;
        s.activeLayer = "SUB";
      });
      // Auto-generate with defaults
      const { _getEngineParams, seed, kit } = get();
      const engineParams = _getEngineParams(inst, macroDefaults, envDefaults, seed, kit[inst]);
      get().generate({ instrument: inst, engineParams });
    },

    // --- Parameters ---
    updateParam: (key, value) => {
      set((s) => {
        s.params[key] = value;
      });
      // Debounced server render
      if (_previewTimeout) clearTimeout(_previewTimeout);
      _previewTimeout = setTimeout(() => {
        const { instrument, params, envelopeParams, seed, kit, _getEngineParams } = get();
        const engineParams = _getEngineParams(instrument, params, envelopeParams, seed, kit[instrument]);
        get().generate({ engineParams });
      }, 300);
    },

    updateEnvelopeParam: (paramId, value) => {
      set((s) => {
        s.envelopeParams[paramId] = value;
      });
      // Debounced server render
      if (_previewTimeout) clearTimeout(_previewTimeout);
      _previewTimeout = setTimeout(() => {
        const { instrument, params, envelopeParams, seed, kit, _getEngineParams } = get();
        const engineParams = _getEngineParams(instrument, params, envelopeParams, seed, kit[instrument]);
        get().generate({ engineParams });
      }, 300);
    },

    resetEnvelope: (envelopeId) => {
      const { instrument } = get();
      const spec = getEnvelopeSpec(instrument);
      const envelope = spec.envelopes.find((e) => e.id === envelopeId);
      const defaults = getCanonicalEnvelopeDefaults(instrument);
      if (!envelope) return;

      const updates: Record<string, number> = {};
      envelope.params.forEach((param) => {
        updates[param.id] = defaults[param.id] ?? param.default;
      });

      set((s) => {
        Object.assign(s.envelopeParams, updates);
      });

      const { params, envelopeParams, seed, kit, _getEngineParams } = get();
      const engineParams = _getEngineParams(instrument, params, envelopeParams, seed, kit[instrument]);
      setTimeout(() => get().generate({ engineParams }), 0);
    },

    // --- Generation ---
    generate: async (overrides) => {
      const now = Date.now();
      if (!overrides?.engineParams && now - _lastTriggerTime < TRIGGER_DEBOUNCE_MS) return;
      _lastTriggerTime = now;

      const state = get();
      const inst = overrides?.instrument ?? state.instrument;
      const currentSeed = overrides?.seed ?? state.seed;
      const macroP = overrides?.params ?? state.params;
      const envP = overrides?.envelopeParams ?? state.envelopeParams;

      const engineParams: EngineParams =
        overrides?.engineParams ?? state._getEngineParams(inst, macroP, envP, currentSeed, state.kit[inst]);
      const seedVal = (engineParams as { seed: number }).seed;

      set((s) => {
        s.isLoading = true;
        s.feedbackSent = null;
      });

      try {
        const blob = await generateAudio(inst, engineParams, seedVal);
        const url = URL.createObjectURL(blob);
        set((s) => {
          s.audioUrl = url;
          if (overrides?.params) s.params = overrides.params;
          if (overrides?.seed !== undefined) s.seed = overrides.seed;
          if (overrides?.envelopeParams) s.envelopeParams = overrides.envelopeParams;
        });
      } catch (err) {
        console.error(err);
      } finally {
        set((s) => {
          s.isLoading = false;
        });
      }
    },

    nextSeed: () => {
      const { instrument } = get();
      const newSeed = Math.floor(Math.random() * 100000);
      const newEnvelopeParams = getRandomEnvelopeParams(instrument);
      get().generate({ seed: newSeed, envelopeParams: newEnvelopeParams });
    },

    // --- ML Feedback ---
    submitFeedback: async (label) => {
      const { instrument, params, seed } = get();
      try {
        await sendFeedback(instrument, params, seed, label);
        set((s) => {
          s.feedbackSent = label;
        });
      } catch (err) {
        console.error("Feedback failed", err);
      }
    },

    aiSuggest: async () => {
      const { instrument } = get();
      set((s) => {
        s.isLoading = true;
      });
      try {
        const newParams = await proposeParams(instrument);
        const newEnvelopeParams = getRandomEnvelopeParams(instrument);
        await get().generate({ params: newParams, envelopeParams: newEnvelopeParams });
      } catch (err) {
        console.error(err);
      } finally {
        set((s) => {
          s.isLoading = false;
        });
      }
    },

    // --- Kit ---
    addToKit: () => {
      const { instrument, params, envelopeParams, seed } = get();
      const slot: KitSlot = {
        schemaVersion: 1,
        params: { ...params },
        envelopeParams: { ...envelopeParams },
        seed,
        repeatMode: instrument === "snare" ? "oneshot" : undefined,
        roomEnabled: false,
      };
      set((s) => {
        s.kit[instrument] = slot;
      });
    },

    exportCurrentKit: async () => {
      const { kit } = get();
      set((s) => {
        s.isExporting = true;
      });
      try {
        const blob = await exportKit({ name: "NeuroKit Unnamed", slots: kit });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "neuro_kit.zip";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (err) {
        console.error(err);
      } finally {
        set((s) => {
          s.isExporting = false;
        });
      }
    },

    // --- Layout (Phase 1) ---
    setActiveLayer: (layer) => {
      set((s) => {
        s.activeLayer = layer;
      });
    },

    setEnvelopeMode: (mode) => {
      set((s) => {
        s.envelopeMode = mode;
      });
    },
  }))
);
