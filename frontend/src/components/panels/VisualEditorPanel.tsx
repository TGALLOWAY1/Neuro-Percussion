/**
 * VisualEditorPanel — central area with Bezier envelope editor overlaid on waveform.
 * Phase 2: Interactive Bezier envelope canvas replaces static waveform viewer.
 */

"use client";

import React, { useEffect } from "react";
import { usePercussionStore, type EnvelopeViewMode } from "@/store/usePercussionStore";
import { BezierEnvelopeCanvas } from "../BezierEnvelopeCanvas";
import { useAudioPlayback } from "@/hooks/useAudioPlayback";
import { RefreshCw } from "lucide-react";
import clsx from "clsx";
import type { BezierEnvelope } from "@/audio/bezier";

const MODES: EnvelopeViewMode[] = ["AMP", "PITCH"];

export const VisualEditorPanel: React.FC = () => {
  const audioUrl = usePercussionStore((s) => s.audioUrl);
  const isLoading = usePercussionStore((s) => s.isLoading);
  const envelopeMode = usePercussionStore((s) => s.envelopeMode);
  const setEnvelopeMode = usePercussionStore((s) => s.setEnvelopeMode);
  const bezierEnvelopes = usePercussionStore((s) => s.bezierEnvelopes);
  const updateBezierEnvelope = usePercussionStore((s) => s.updateBezierEnvelope);
  const syncBezierFromParams = usePercussionStore((s) => s.syncBezierFromParams);
  const timingMs = usePercussionStore((s) => s.timingMs);
  const setTimingMs = usePercussionStore((s) => s.setTimingMs);

  const { audioBuffer } = useAudioPlayback(audioUrl);

  // Sync Bezier envelopes from params on mount
  useEffect(() => {
    if (Object.keys(bezierEnvelopes).length === 0) {
      syncBezierFromParams();
    }
  }, []);

  // Get the envelope for the current mode
  const envelopeId = envelopeMode.toLowerCase(); // "AMP" → "amp", "PITCH" → "pitch"
  const currentEnvelope = bezierEnvelopes[envelopeId];

  const handleEnvelopeChange = (newEnvelope: BezierEnvelope) => {
    updateBezierEnvelope(envelopeId, newEnvelope);
  };

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Top bar: mode toggle + TIMING fader */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex bg-neutral-900 rounded-lg p-0.5 gap-0.5">
          {MODES.map((mode) => (
            <button
              key={mode}
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
          <span className="text-[10px] text-neutral-500 font-mono uppercase tracking-wider whitespace-nowrap">
            Timing
          </span>
          <input
            type="range"
            min={50}
            max={3000}
            step={10}
            value={timingMs}
            onChange={(e) => setTimingMs(Number(e.target.value))}
            className="flex-1 h-1 accent-emerald-500"
          />
          <span className="text-[10px] text-emerald-400 font-mono w-14 text-right">
            {timingMs} ms
          </span>
        </div>

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
