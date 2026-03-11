/**
 * Core Zustand store for Neuro-Percussion.
 * Composed from focused slices for maintainability.
 *
 * Slices:
 *  - audioSlice: instrument, params, generation, WAV export
 *  - mutationSlice: dice, mutate, AI suggest, feedback
 *  - envelopeSlice: bezier sync, envelope mode, layout
 *  - kitSlice: kit management and export
 */

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { PercussionStore } from "./types";
import { createAudioSlice } from "./slices/audioSlice";
import { createMutationSlice } from "./slices/mutationSlice";
import { createEnvelopeSlice } from "./slices/envelopeSlice";
import { createKitSlice } from "./slices/kitSlice";

// Re-export types for backward compatibility
export type {
  LayerTab,
  EnvelopeViewMode,
  MutationFocus,
  KitSlot,
  PercussionStore,
} from "./types";

// Re-export state/action interfaces under their original names
export type { PercussionState, PercussionActions } from "./types";

export const usePercussionStore = create<PercussionStore>()(
  immer((...args) => ({
    ...createAudioSlice(...args),
    ...createMutationSlice(...args),
    ...createEnvelopeSlice(...args),
    ...createKitSlice(...args),
  }))
);
