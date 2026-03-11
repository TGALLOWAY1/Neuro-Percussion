/**
 * LayersPanel — left sidebar with layer tabs (SUB, CLICK1-3) and parameter controls.
 * Phase 1: SUB layer wired with existing envelope controls. CLICK tabs are stubs.
 */

"use client";

import React from "react";
import { usePercussionStore, type LayerTab } from "@/store/usePercussionStore";
import { EnvelopeStrip } from "../envelopes/EnvelopeStrip";
import { getEnvelopeSpec } from "@/audio/params";
import clsx from "clsx";

const LAYERS: { id: LayerTab; label: string; available: boolean }[] = [
  { id: "SUB", label: "SUB", available: true },
  { id: "CLICK1", label: "CLICK 1", available: false },
  { id: "CLICK2", label: "CLICK 2", available: false },
  { id: "CLICK3", label: "CLICK 3", available: false },
];

export const LayersPanel: React.FC = () => {
  const activeLayer = usePercussionStore((s) => s.activeLayer);
  const setActiveLayer = usePercussionStore((s) => s.setActiveLayer);
  const instrument = usePercussionStore((s) => s.instrument);
  const envelopeParams = usePercussionStore((s) => s.envelopeParams);
  const updateEnvelopeParam = usePercussionStore((s) => s.updateEnvelopeParam);
  const resetEnvelope = usePercussionStore((s) => s.resetEnvelope);

  const spec = getEnvelopeSpec(instrument);

  return (
    <div className="flex flex-col h-full">
      {/* Layer tabs */}
      <div className="flex border-b border-neutral-800">
        {LAYERS.map((layer) => (
          <button
            key={layer.id}
            onClick={() => layer.available && setActiveLayer(layer.id)}
            disabled={!layer.available}
            className={clsx(
              "flex-1 px-2 py-3 text-xs font-semibold uppercase tracking-wider transition-all text-center",
              activeLayer === layer.id
                ? "bg-neutral-900 text-emerald-400 border-b-2 border-emerald-500"
                : layer.available
                ? "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/50"
                : "text-neutral-700 cursor-not-allowed"
            )}
          >
            {layer.label}
            {!layer.available && (
              <span className="block text-[9px] text-neutral-700 mt-0.5">Soon</span>
            )}
          </button>
        ))}
      </div>

      {/* Layer content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeLayer === "SUB" ? (
          <EnvelopeStrip
            spec={spec}
            values={envelopeParams}
            onChange={updateEnvelopeParam}
            onReset={resetEnvelope}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-neutral-600">
            <div className="text-4xl mb-3">+</div>
            <p className="text-sm font-medium">Click Layer</p>
            <p className="text-xs text-neutral-700 mt-1">Coming in Phase 4</p>
          </div>
        )}
      </div>
    </div>
  );
};
