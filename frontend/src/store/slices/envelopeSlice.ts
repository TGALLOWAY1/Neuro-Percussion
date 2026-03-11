/**
 * Envelope slice: bezier sync, envelope mode, layout state.
 */
import type { StateCreator } from "zustand";
import type { PercussionStore, EnvelopeState, EnvelopeActions } from "../types";
import type { BezierEnvelope } from "@/audio/bezier";
import { paramsToEnvelope, envelopeToParams } from "@/audio/bezier";
import { getEnvelopeSpec } from "@/audio/params";

/**
 * Extract attack/decay/hold/curve param IDs from an envelope spec.
 * Returns null for envelopes without time-domain params (NONE mode).
 */
function getEnvelopeParamIds(
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

/** Debounce timer for bezier envelope changes */
let _bezierPreviewTimeout: ReturnType<typeof setTimeout> | null = null;

export const createEnvelopeSlice: StateCreator<
  PercussionStore,
  [["zustand/immer", never]],
  [],
  EnvelopeState & EnvelopeActions
> = (set, get) => ({
  // Initial state
  bezierEnvelopes: {},
  masterDurationMs: 500,
  activeLayer: "SUB",
  envelopeMode: "AMP",

  // --- Layout ---
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

  // --- Bezier Envelope ---
  updateBezierEnvelope: (envelopeId, envelope) => {
    set((s) => {
      s.bezierEnvelopes[envelopeId] = envelope;
    });

    // Convert Bezier nodes back to envelope params and update
    const { instrument, masterDurationMs } = get();
    const spec = getEnvelopeSpec(instrument);
    const envSpec = spec.envelopes.find((e) => e.id === envelopeId);
    if (!envSpec) return;

    const paramIds = getEnvelopeParamIds(envSpec);
    if (!paramIds) return;

    const newParams = envelopeToParams(envelope, envSpec.mode as "AD" | "AHD", masterDurationMs, paramIds);

    // Update envelope params without re-triggering Bezier sync
    set((s) => {
      Object.assign(s.envelopeParams, newParams);
    });

    // Debounced server render
    if (_bezierPreviewTimeout) clearTimeout(_bezierPreviewTimeout);
    _bezierPreviewTimeout = setTimeout(() => {
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
      const paramIds = getEnvelopeParamIds(envSpec);
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

  setMasterDurationMs: (ms) => {
    set((s) => {
      s.masterDurationMs = ms;
    });
  },
});
