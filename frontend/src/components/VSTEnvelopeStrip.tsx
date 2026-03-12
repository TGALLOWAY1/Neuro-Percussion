/**
 * VSTEnvelopeStrip — shows AMP and PITCH Bezier envelopes side-by-side.
 * Central visual area for the VST-style layout.
 */

"use client";

import React, { useEffect, useCallback } from "react";
import { usePercussionStore } from "@/store/usePercussionStore";
import { BezierEnvelopeCanvas } from "./BezierEnvelopeCanvas";
import { useAudioPlayback } from "@/hooks/useAudioPlayback";
import { playPreview, getInstrumentFrequency, getInstrumentWaveform } from "@/audio/preview";
import { Volume2 } from "lucide-react";
import clsx from "clsx";

export const VSTEnvelopeStrip: React.FC = () => {
  const audioUrl = usePercussionStore((s) => s.audioUrl);
  const instrument = usePercussionStore((s) => s.instrument);
  const bezierEnvelopes = usePercussionStore((s) => s.bezierEnvelopes);
  const updateBezierEnvelope = usePercussionStore((s) => s.updateBezierEnvelope);
  const syncBezierFromParams = usePercussionStore((s) => s.syncBezierFromParams);
  const masterDurationMs = usePercussionStore((s) => s.masterDurationMs);
  const setMasterDurationMs = usePercussionStore((s) => s.setMasterDurationMs);
  const [previewEnabled, setPreviewEnabled] = React.useState(true);

  const { audioBuffer } = useAudioPlayback(audioUrl);

  // Sync on mount
  useEffect(() => {
    if (Object.keys(bezierEnvelopes).length === 0) {
      syncBezierFromParams();
    }
  }, []);

  // Show canvases only for envelopes that have actual Bezier data
  const ampEnvelope = bezierEnvelopes["amp"];
  const pitchEnvelope = bezierEnvelopes["pitch"];
  const hasPitch = !!pitchEnvelope;

  const handleDragEnd = useCallback(() => {
    if (!previewEnabled) return;
    const store = usePercussionStore.getState();
    const ampEnv = store.bezierEnvelopes["amp"];
    const pitchEnv = store.bezierEnvelopes["pitch"];
    playPreview({
      frequency: getInstrumentFrequency(store.instrument),
      ampEnvelope: ampEnv,
      pitchEnvelope: pitchEnv,
      duration: store.masterDurationMs / 1000,
      waveform: getInstrumentWaveform(store.instrument),
      clickAmount: (store.envelopeParams["click_amount_pct"] ?? 0) / 100,
      clickDecay: (store.envelopeParams["click_decay_ms"] ?? 12) / 1000,
    });
  }, [previewEnabled]);

  return (
    <div className="flex flex-col gap-2">
      {/* Controls bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-neutral-500 font-mono uppercase tracking-wider">
              Timing
            </label>
            <input
              type="range"
              min={50}
              max={3000}
              step={10}
              value={masterDurationMs}
              onChange={(e) => setMasterDurationMs(Number(e.target.value))}
              className="w-24 h-1 accent-emerald-500"
            />
            <span className="text-[10px] text-emerald-400 font-mono w-14 text-right">
              {masterDurationMs} ms
            </span>
          </div>
        </div>
        <button
          onClick={() => setPreviewEnabled(!previewEnabled)}
          className={clsx(
            "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono uppercase transition-colors",
            previewEnabled
              ? "text-emerald-400 bg-emerald-950 border border-emerald-800"
              : "text-neutral-600 bg-neutral-900 border border-neutral-800"
          )}
          aria-pressed={previewEnabled}
        >
          <Volume2 size={10} />
          Preview
        </button>
      </div>

      {/* Canvases */}
      <div className={clsx("grid gap-2", hasPitch ? "grid-cols-2" : "grid-cols-1")}>
        {/* AMP envelope */}
        <div className="relative">
          <div className="absolute top-2 left-3 z-10 text-[10px] font-bold text-emerald-500/60 uppercase tracking-wider pointer-events-none">
            AMP
          </div>
          {ampEnvelope ? (
            <BezierEnvelopeCanvas
              audioBuffer={audioBuffer}
              envelope={ampEnvelope}
              onEnvelopeChange={(env) => updateBezierEnvelope("amp", env)}
              onDragEnd={handleDragEnd}
              height={200}
              mode="AMP"
            />
          ) : (
            <div className="w-full rounded-lg border border-neutral-800 bg-neutral-900 flex items-center justify-center" style={{ height: 200 }}>
              <span className="text-xs text-neutral-600 font-mono">No AMP envelope</span>
            </div>
          )}
        </div>

        {/* PITCH envelope */}
        {hasPitch && (
          <div className="relative">
            <div className="absolute top-2 left-3 z-10 text-[10px] font-bold text-amber-500/60 uppercase tracking-wider pointer-events-none">
              PITCH
            </div>
            {pitchEnvelope ? (
              <BezierEnvelopeCanvas
                audioBuffer={null}
                envelope={pitchEnvelope}
                onEnvelopeChange={(env) => updateBezierEnvelope("pitch", env)}
                onDragEnd={handleDragEnd}
                height={200}
                mode="PITCH"
              />
            ) : (
              <div className="w-full rounded-lg border border-neutral-800 bg-neutral-900 flex items-center justify-center" style={{ height: 200 }}>
                <span className="text-xs text-neutral-600 font-mono">No PITCH envelope</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
