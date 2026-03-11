/**
 * VisualEditorPanel — central area with Bezier envelope editor overlaid on waveform.
 * Phase 2: Interactive Bezier envelope canvas.
 * Phase 5: Client-side preview engine for instant feedback on drag end.
 */

"use client";

import React, { useEffect, useCallback } from "react";
import { usePercussionStore, type EnvelopeViewMode } from "@/store/usePercussionStore";
import { BezierEnvelopeCanvas } from "../BezierEnvelopeCanvas";
import { useAudioPlayback } from "@/hooks/useAudioPlayback";
import { RefreshCw, Volume2 } from "lucide-react";
import clsx from "clsx";
import type { BezierEnvelope } from "@/audio/bezier";
import { playPreview, getInstrumentFrequency, getInstrumentWaveform } from "@/audio/preview";

const MODES: EnvelopeViewMode[] = ["AMP", "PITCH"];

export const VisualEditorPanel: React.FC = () => {
  const audioUrl = usePercussionStore((s) => s.audioUrl);
  const isLoading = usePercussionStore((s) => s.isLoading);
  const envelopeMode = usePercussionStore((s) => s.envelopeMode);
  const setEnvelopeMode = usePercussionStore((s) => s.setEnvelopeMode);
  const bezierEnvelopes = usePercussionStore((s) => s.bezierEnvelopes);
  const updateBezierEnvelope = usePercussionStore((s) => s.updateBezierEnvelope);
  const syncBezierFromParams = usePercussionStore((s) => s.syncBezierFromParams);
  const masterDurationMs = usePercussionStore((s) => s.masterDurationMs);
  const setMasterDurationMs = usePercussionStore((s) => s.setMasterDurationMs);
  const instrument = usePercussionStore((s) => s.instrument);
  const [previewEnabled, setPreviewEnabled] = React.useState(true);

  const { audioBuffer } = useAudioPlayback(audioUrl);

  // Sync Bezier envelopes from params on mount
  useEffect(() => {
    if (Object.keys(bezierEnvelopes).length === 0) {
      syncBezierFromParams();
    }
  }, []);

  // Get the envelope for the current mode
  const envelopeId = envelopeMode.toLowerCase();
  const currentEnvelope = bezierEnvelopes[envelopeId];

  const handleEnvelopeChange = (newEnvelope: BezierEnvelope) => {
    updateBezierEnvelope(envelopeId, newEnvelope);
  };

  // Play preview sound when drag ends
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
    <div className="flex flex-col h-full gap-3">
      {/* Top bar: mode toggle + TIMING fader + preview toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex bg-neutral-900 rounded-lg p-0.5 gap-0.5" role="radiogroup" aria-label="Envelope mode">
          {MODES.map((mode) => (
            <button
              key={mode}
              role="radio"
              aria-checked={envelopeMode === mode}
              onClick={() => setEnvelopeMode(mode)}
              className={clsx(
                "px-3 py-1 text-xs font-bold rounded-md uppercase tracking-wider transition-all",
                envelopeMode === mode
                  ? "bg-emerald-600 text-white"
                  : "text-neutral-500 hover:text-neutral-300"
              )}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* TIMING master fader */}
        <div className="flex items-center gap-2 flex-1 max-w-xs">
          <label
            htmlFor="timing-fader"
            className="text-[10px] text-neutral-500 font-mono uppercase tracking-wider whitespace-nowrap"
          >
            Timing
          </label>
          <input
            id="timing-fader"
            type="range"
            min={50}
            max={3000}
            step={10}
            value={masterDurationMs}
            onChange={(e) => setMasterDurationMs(Number(e.target.value))}
            className="flex-1 h-1 accent-emerald-500"
            aria-label={`Timing: ${masterDurationMs} milliseconds`}
          />
          <span className="text-[10px] text-emerald-400 font-mono w-14 text-right" aria-hidden="true">
            {masterDurationMs} ms
          </span>
        </div>

        {/* Preview toggle */}
        <button
          onClick={() => setPreviewEnabled(!previewEnabled)}
          className={clsx(
            "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono uppercase transition-colors",
            previewEnabled
              ? "text-emerald-400 bg-emerald-950 border border-emerald-800"
              : "text-neutral-600 bg-neutral-900 border border-neutral-800"
          )}
          title={previewEnabled ? "Preview on (click to disable)" : "Preview off (click to enable)"}
          aria-pressed={previewEnabled}
          aria-label={`Audio preview ${previewEnabled ? "enabled" : "disabled"}`}
        >
          <Volume2 size={10} />
          Preview
        </button>

        <span className="text-xs text-neutral-600 font-mono">
          {envelopeMode === "AMP" ? "Amplitude Envelope" : "Pitch Envelope"}
        </span>
      </div>

      {/* Bezier envelope + waveform canvas */}
      <div className="flex-1 relative min-h-0">
        {currentEnvelope ? (
          <BezierEnvelopeCanvas
            audioBuffer={audioBuffer}
            envelope={currentEnvelope}
            onEnvelopeChange={handleEnvelopeChange}
            onDragEnd={handleDragEnd}
            height={256}
            mode={envelopeMode}
          />
        ) : (
          <div
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 flex items-center justify-center"
            style={{ height: 256 }}
          >
            <span className="text-xs text-neutral-600 font-mono">
              No {envelopeMode.toLowerCase()} envelope for this instrument
            </span>
          </div>
        )}

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm rounded-lg">
            <RefreshCw className="animate-spin text-emerald-500" size={24} />
          </div>
        )}
      </div>
    </div>
  );
};
