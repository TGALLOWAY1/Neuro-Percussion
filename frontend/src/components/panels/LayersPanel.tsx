/**
 * LayersPanel — left sidebar with layer tabs (SUB, CLICK1-3) and parameter controls.
 * Phase 4: Click layers with built-in sample library selection.
 */

"use client";

import React from "react";
import { usePercussionStore, type LayerTab } from "@/store/usePercussionStore";
import { EnvelopeStrip } from "../envelopes/EnvelopeStrip";
import { getEnvelopeSpec } from "@/audio/params";
import clsx from "clsx";
import { Volume2, VolumeX } from "lucide-react";

const LAYERS: { id: LayerTab; label: string }[] = [
  { id: "SUB", label: "SUB" },
  { id: "CLICK1", label: "CLICK 1" },
  { id: "CLICK2", label: "CLICK 2" },
  { id: "CLICK3", label: "CLICK 3" },
];

/** Built-in click transient samples (stubs for Phase 4) */
const CLICK_SAMPLES = [
  { id: "none", label: "— None —" },
  { id: "stick_attack", label: "Stick Attack" },
  { id: "beater_click", label: "Beater Click" },
  { id: "rim_snap", label: "Rim Snap" },
  { id: "plastic_click", label: "Plastic Click" },
  { id: "wood_knock", label: "Wood Knock" },
  { id: "metal_tap", label: "Metal Tap" },
  { id: "soft_mallet", label: "Soft Mallet" },
  { id: "brush_hit", label: "Brush Hit" },
];

interface ClickLayerState {
  sample: string;
  gain: number;
  enabled: boolean;
}

const defaultClickState: ClickLayerState = {
  sample: "none",
  gain: 0.5,
  enabled: false,
};

export const LayersPanel: React.FC = () => {
  const activeLayer = usePercussionStore((s) => s.activeLayer);
  const setActiveLayer = usePercussionStore((s) => s.setActiveLayer);
  const instrument = usePercussionStore((s) => s.instrument);
  const envelopeParams = usePercussionStore((s) => s.envelopeParams);
  const updateEnvelopeParam = usePercussionStore((s) => s.updateEnvelopeParam);
  const resetEnvelope = usePercussionStore((s) => s.resetEnvelope);

  // Click layer state (local — will be lifted to store when samples are functional)
  const [clickLayers, setClickLayers] = React.useState<Record<string, ClickLayerState>>({
    CLICK1: { ...defaultClickState },
    CLICK2: { ...defaultClickState },
    CLICK3: { ...defaultClickState },
  });

  const spec = getEnvelopeSpec(instrument);

  const updateClickLayer = (layerId: string, updates: Partial<ClickLayerState>) => {
    setClickLayers((prev) => ({
      ...prev,
      [layerId]: { ...prev[layerId], ...updates },
    }));
  };

  const isClickLayer = activeLayer.startsWith("CLICK");
  const currentClick = clickLayers[activeLayer] ?? defaultClickState;

  return (
    <div className="flex flex-col h-full">
      {/* Layer tabs */}
      <div className="flex border-b border-neutral-800">
        {LAYERS.map((layer) => {
          const isClick = layer.id.startsWith("CLICK");
          const clickState = clickLayers[layer.id];
          const hasActiveSample = isClick && clickState?.sample !== "none";

          return (
            <button
              key={layer.id}
              onClick={() => setActiveLayer(layer.id)}
              className={clsx(
                "flex-1 px-2 py-3 text-xs font-semibold uppercase tracking-wider transition-all text-center",
                activeLayer === layer.id
                  ? "bg-neutral-900 text-emerald-400 border-b-2 border-emerald-500"
                  : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/50"
              )}
            >
              {layer.label}
              {hasActiveSample && (
                <span className="block text-[8px] text-emerald-600 mt-0.5">
                  {clickState.sample.replace("_", " ")}
                </span>
              )}
            </button>
          );
        })}
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
        ) : isClickLayer ? (
          <div className="flex flex-col gap-4">
            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                {activeLayer.replace("CLICK", "Click ")}
              </span>
              <button
                onClick={() => updateClickLayer(activeLayer, { enabled: !currentClick.enabled })}
                className={clsx(
                  "p-1.5 rounded transition-colors",
                  currentClick.enabled
                    ? "text-emerald-400 bg-emerald-950"
                    : "text-neutral-600 bg-neutral-800"
                )}
              >
                {currentClick.enabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
            </div>

            {/* Sample selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-neutral-500 font-mono uppercase">
                Transient Sample
              </label>
              <select
                value={currentClick.sample}
                onChange={(e) =>
                  updateClickLayer(activeLayer, {
                    sample: e.target.value,
                    enabled: e.target.value !== "none",
                  })
                }
                className="bg-neutral-800 text-neutral-300 text-xs rounded px-3 py-2 border border-neutral-700 focus:border-emerald-600 outline-none"
              >
                {CLICK_SAMPLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Gain slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between">
                <label className="text-[10px] text-neutral-500 font-mono uppercase">
                  Level
                </label>
                <span className="text-[10px] text-emerald-400 font-mono">
                  {Math.round(currentClick.gain * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={currentClick.gain}
                onChange={(e) =>
                  updateClickLayer(activeLayer, { gain: Number(e.target.value) })
                }
                className="w-full h-1 accent-emerald-500"
                disabled={!currentClick.enabled}
              />
            </div>

            {/* Info note */}
            <p className="text-[10px] text-neutral-700 mt-2 leading-relaxed">
              Click layers add transient samples on top of the synthesized sound.
              Select a sample and adjust the level to blend with the sub layer.
              Sample audio integration coming soon.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
};
