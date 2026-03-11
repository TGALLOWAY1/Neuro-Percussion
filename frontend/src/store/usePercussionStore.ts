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
import { generateAudio, sendFeedback, proposeParams, exportKit, renderHighQuality } from "@/lib/api";
import type { BezierEnvelope } from "@/audio/bezier";
import { paramsToEnvelope, envelopeToParams } from "@/audio/bezier";

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

  // Bezier envelope state (Phase 2)
  bezierEnvelopes: Record<string, BezierEnvelope>; // keyed by envelope id ("amp", "pitch", etc.)
  timingMs: number; // master TIMING fader (total duration in ms)

  // Regenerator state (Phase 3)
  mutationFocus: MutationFocus; // which param group to focus mutations on
  mutationAmount: number; // 0-1 intensity of Smart Mutate
  feedbackHistory: Array<{ instrument: InstrumentType; seed: number; label: number }>;
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

  // Regenerator (Phase 3)
  rollDice: () => void;
  smartMutate: () => void;
  setMutationFocus: (focus: MutationFocus) => void;
  setMutationAmount: (amount: number) => void;

  // Kit & Export (Phase 4)
  addToKit: () => void;
  exportCurrentKit: () => Promise<void>;
  saveWav: () => Promise<void>;

  // Layout (Phase 1)
  setActiveLayer: (layer: LayerTab) => void;
  setEnvelopeMode: (mode: EnvelopeViewMode) => void;

  // Bezier envelope (Phase 2)
  updateBezierEnvelope: (envelopeId: string, envelope: BezierEnvelope) => void;
  syncBezierFromParams: () => void;
  setTimingMs: (ms: number) => void;

  // Helpers (internal)
  _getEngineParams: (
    inst: InstrumentType,
    macroParams: Record<string, number>,
    envParams: Record<string, number>,
    seedVal: number,
    kitPatch?: KitSlot
  ) => EngineParams;
}

/**
 * Extract attack/decay/hold/curve param IDs from an envelope spec.
 * Returns null for envelopes without time-domain params (NONE mode).
 */
function _getParamIdsForEnvelope(
  envSpec: { id: string; mode: string; params: { id: string; unit: string }[] }
): { attack: string; decay: string; hold?: string; curve?: string } | null {
  if (envSpec.mode === "NONE") return null;

  const attack = envSpec.params.find((p) => p.id.includes("attack") && p.unit === "ms");
  const decay = envSpec.params.find((p) => p.id.includes("decay") && p.unit === "ms");
  if (!attack || !decay) return null;

  const hold = envSpec.params.find((p) => p.id.includes("hold") && p.unit === "ms");
  const curve = envSpec.params.find((p) => p.id.includes("curve"));

  return {
    attack: attack.id,
    decay: decay.id,
    hold: hold?.id,
    curve: curve?.id,
  };
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
    bezierEnvelopes: {},
    timingMs: 500,
    mutationFocus: "all" as MutationFocus,
    mutationAmount: 0.3,
    feedbackHistory: [],

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
      // Sync Bezier envelopes from new defaults
      setTimeout(() => get().syncBezierFromParams(), 0);
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
          s.feedbackHistory.push({ instrument, seed, label });
          // Keep last 50 entries
          if (s.feedbackHistory.length > 50) {
            s.feedbackHistory = s.feedbackHistory.slice(-50);
          }
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

    // --- Regenerator (Phase 3) ---
    rollDice: () => {
      const { instrument } = get();
      const newSeed = Math.floor(Math.random() * 100000);
      const newEnvelopeParams = getRandomEnvelopeParams(instrument);
      // Also randomize macros
      const spec = getEnvelopeSpec(instrument);
      const newMacros: Record<string, number> = {};
      for (const p of spec.macroParams ?? []) {
        newMacros[p.id] = p.min + Math.random() * (p.max - p.min);
        if (p.step) {
          newMacros[p.id] = Math.round(newMacros[p.id] / p.step) * p.step;
        }
      }

      set((s) => {
        s.params = newMacros;
        s.feedbackSent = null;
      });

      get().generate({ seed: newSeed, params: newMacros, envelopeParams: newEnvelopeParams });
      setTimeout(() => get().syncBezierFromParams(), 50);
    },

    smartMutate: () => {
      const { instrument, params, envelopeParams, mutationFocus, mutationAmount } = get();
      const spec = getEnvelopeSpec(instrument);
      const newSeed = Math.floor(Math.random() * 100000);

      // Mutate envelope params based on focus
      const newEnvParams = { ...envelopeParams };
      const envSpecs = spec.envelopes;

      for (const envSpec of envSpecs) {
        // If focus is set, only mutate matching envelope group
        if (mutationFocus !== "all" && mutationFocus !== "macros" && envSpec.id !== mutationFocus) {
          continue;
        }
        if (mutationFocus === "macros") continue;

        for (const p of envSpec.params) {
          const current = newEnvParams[p.id] ?? p.default;
          const range = p.max - p.min;
          const jitter = (Math.random() - 0.5) * 2 * range * mutationAmount;
          let newVal = current + jitter;
          if (p.step) newVal = Math.round(newVal / p.step) * p.step;
          newEnvParams[p.id] = Math.max(p.min, Math.min(p.max, newVal));
        }
      }

      // Mutate macro params if focus is "all" or "macros"
      const newMacros = { ...params };
      if (mutationFocus === "all" || mutationFocus === "macros") {
        for (const p of spec.macroParams ?? []) {
          const current = newMacros[p.id] ?? p.default;
          const range = p.max - p.min;
          const jitter = (Math.random() - 0.5) * 2 * range * mutationAmount;
          let newVal = current + jitter;
          if (p.step) newVal = Math.round(newVal / p.step) * p.step;
          newMacros[p.id] = Math.max(p.min, Math.min(p.max, newVal));
        }
      }

      set((s) => {
        s.envelopeParams = newEnvParams;
        s.params = newMacros;
        s.feedbackSent = null;
      });

      get().generate({ seed: newSeed, params: newMacros, envelopeParams: newEnvParams });
      setTimeout(() => get().syncBezierFromParams(), 50);
    },

    setMutationFocus: (focus) => {
      set((s) => {
        s.mutationFocus = focus;
      });
    },

    setMutationAmount: (amount) => {
      set((s) => {
        s.mutationAmount = amount;
      });
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

    saveWav: async () => {
      const { instrument, params, envelopeParams, seed, kit, _getEngineParams } = get();
      set((s) => {
        s.isLoading = true;
      });
      try {
        const engineParams = _getEngineParams(instrument, params, envelopeParams, seed, kit[instrument]);
        const blob = await renderHighQuality(instrument, engineParams, seed);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `neuro_${instrument}_${seed}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("WAV save failed", err);
      } finally {
        set((s) => {
          s.isLoading = false;
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

    // --- Bezier Envelope (Phase 2) ---
    updateBezierEnvelope: (envelopeId, envelope) => {
      set((s) => {
        s.bezierEnvelopes[envelopeId] = envelope;
      });

      // Convert Bezier nodes back to envelope params and update
      const { instrument, timingMs } = get();
      const spec = getEnvelopeSpec(instrument);
      const envSpec = spec.envelopes.find((e) => e.id === envelopeId);
      if (!envSpec) return;

      const paramIds = _getParamIdsForEnvelope(envSpec);
      if (!paramIds) return;

      const newParams = envelopeToParams(envelope, envSpec.mode as "AD" | "AHD", timingMs, paramIds);

      // Update envelope params without re-triggering Bezier sync
      set((s) => {
        Object.assign(s.envelopeParams, newParams);
      });

      // Debounced server render
      if (_previewTimeout) clearTimeout(_previewTimeout);
      _previewTimeout = setTimeout(() => {
        const { instrument: inst, params, envelopeParams, seed, kit, _getEngineParams } = get();
        const engineParams = _getEngineParams(inst, params, envelopeParams, seed, kit[inst]);
        get().generate({ engineParams });
      }, 300);
    },

    syncBezierFromParams: () => {
      const { instrument, envelopeParams } = get();
      const spec = getEnvelopeSpec(instrument);
      const newBezier: Record<string, BezierEnvelope> = {};

      for (const envSpec of spec.envelopes) {
        if (envSpec.mode === "NONE") continue;
        const paramIds = _getParamIdsForEnvelope(envSpec);
        if (!paramIds) continue;
        newBezier[envSpec.id] = paramsToEnvelope(
          envSpec.mode as "AD" | "AHD",
          envelopeParams,
          paramIds
        );
      }

      set((s) => {
        s.bezierEnvelopes = newBezier;
      });
    },

    setTimingMs: (ms) => {
      set((s) => {
        s.timingMs = ms;
      });
    },
  }))
);
