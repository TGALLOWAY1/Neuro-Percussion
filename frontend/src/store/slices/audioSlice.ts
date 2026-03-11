/**
 * Audio slice: core synth state, generation, parameters, and WAV export.
 */
import type { StateCreator } from "zustand";
import type { PercussionStore, AudioState, AudioActions } from "../types";
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
} from "@/audio/contract";
import { generateAudio, renderHighQuality } from "@/lib/api";

/** Debounce timer for parameter changes (not stored in Zustand) */
let _previewTimeout: ReturnType<typeof setTimeout> | null = null;
/** Debounce guard */
let _lastTriggerTime = 0;
const TRIGGER_DEBOUNCE_MS = 50;

export const createAudioSlice: StateCreator<
  PercussionStore,
  [["zustand/immer", never]],
  [],
  AudioState & AudioActions
> = (set, get) => ({
  // Initial state
  instrument: "kick",
  params: getMacroDefaults("kick"),
  envelopeParams: getCanonicalEnvelopeDefaults("kick"),
  seed: 42,
  audioUrl: null,
  isLoading: false,
  error: null,

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
      s.lastFeedbackLabel = null;
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

    const engineParams =
      overrides?.engineParams ?? state._getEngineParams(inst, macroP, envP, currentSeed, state.kit[inst]);
    const seedVal = (engineParams as { seed: number }).seed;

    set((s) => {
      s.isLoading = true;
      s.lastFeedbackLabel = null;
      s.error = null;
    });

    try {
      const blob = await generateAudio(inst, engineParams, seedVal);
      const url = URL.createObjectURL(blob);
      const oldUrl = get().audioUrl;
      set((s) => {
        s.audioUrl = url;
        if (overrides?.params) s.params = overrides.params;
        if (overrides?.seed !== undefined) s.seed = overrides.seed;
        if (overrides?.envelopeParams) s.envelopeParams = overrides.envelopeParams;
      });
      // Revoke old blob URL to prevent memory leak
      if (oldUrl) URL.revokeObjectURL(oldUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Audio generation failed";
      console.error(message, err);
      set((s) => {
        s.error = message;
      });
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
      const message = err instanceof Error ? err.message : "WAV save failed";
      console.error(message, err);
      set((s) => { s.error = message; });
    } finally {
      set((s) => {
        s.isLoading = false;
      });
    }
  },

  clearError: () => {
    set((s) => {
      s.error = null;
    });
  },
});
