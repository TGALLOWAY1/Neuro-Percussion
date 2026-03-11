/**
 * Kit slice: kit management and export.
 */
import type { StateCreator } from "zustand";
import type { PercussionStore, KitState, KitActions, KitSlot } from "../types";
import { exportKit } from "@/lib/api";

export const createKitSlice: StateCreator<
  PercussionStore,
  [["zustand/immer", never]],
  [],
  KitState & KitActions
> = (set, get) => ({
  // Initial state
  kit: {},
  isExporting: false,

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
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Kit export failed";
      console.error(message, err);
      set((s) => { s.error = message; });
    } finally {
      set((s) => {
        s.isExporting = false;
      });
    }
  },
});
