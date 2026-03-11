/**
 * Mutation slice: dice, mutate, AI suggest, and ML feedback.
 */
import type { StateCreator } from "zustand";
import type { PercussionStore, MutationState, MutationActions } from "../types";
import {
  getRandomEnvelopeParams,
  getEnvelopeSpec,
} from "@/audio/params";
import { sendFeedback, proposeParams } from "@/lib/api";

export const createMutationSlice: StateCreator<
  PercussionStore,
  [["zustand/immer", never]],
  [],
  MutationState & MutationActions
> = (set, get) => ({
  // Initial state
  feedbackSent: null,
  mutationFocus: "all",
  mutationAmount: 0.3,
  feedbackHistory: [],

  // --- ML Feedback ---
  submitFeedback: async (label) => {
    const { instrument, params, seed } = get();
    try {
      await sendFeedback(instrument, params, seed, label);
      set((s) => {
        s.feedbackSent = label;
        s.feedbackHistory.push({ instrument, seed, label });
        if (s.feedbackHistory.length > 50) {
          s.feedbackHistory = s.feedbackHistory.slice(-50);
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Feedback submission failed";
      console.error(message, err);
      set((s) => { s.error = message; });
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
      const message = err instanceof Error ? err.message : "AI suggestion failed";
      console.error(message, err);
      set((s) => { s.error = message; });
    } finally {
      set((s) => {
        s.isLoading = false;
      });
    }
  },

  // --- Regenerator ---
  rollDice: () => {
    const { instrument } = get();
    const newSeed = Math.floor(Math.random() * 100000);
    const newEnvelopeParams = getRandomEnvelopeParams(instrument);
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
});
