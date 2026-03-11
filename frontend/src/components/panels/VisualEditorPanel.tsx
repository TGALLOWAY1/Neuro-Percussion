/**
 * VisualEditorPanel — central area with waveform canvas and envelope mode toggle.
 * Phase 1: Waveform canvas with PITCH/AMP mode toggle (visual only).
 * Phase 2: Will add Bezier envelope overlay.
 */

"use client";

import React from "react";
import { usePercussionStore, type EnvelopeViewMode } from "@/store/usePercussionStore";
import { WaveformCanvas } from "../WaveformCanvas";
import { useAudioPlayback } from "@/hooks/useAudioPlayback";
import { RefreshCw } from "lucide-react";
import clsx from "clsx";

const MODES: EnvelopeViewMode[] = ["AMP", "PITCH"];

export const VisualEditorPanel: React.FC = () => {
  const audioUrl = usePercussionStore((s) => s.audioUrl);
  const isLoading = usePercussionStore((s) => s.isLoading);
  const envelopeMode = usePercussionStore((s) => s.envelopeMode);
  const setEnvelopeMode = usePercussionStore((s) => s.setEnvelopeMode);

  const { audioBuffer } = useAudioPlayback(audioUrl);

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Mode toggle */}
      <div className="flex items-center justify-between">
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
        <span className="text-xs text-neutral-600 font-mono">
          {envelopeMode === "AMP" ? "Amplitude Envelope" : "Pitch Envelope"}
        </span>
      </div>

      {/* Waveform + envelope canvas */}
      <div className="flex-1 relative min-h-0">
        <WaveformCanvas
          audioBuffer={audioBuffer}
          height={256}
        />

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm rounded-lg">
            <RefreshCw className="animate-spin text-emerald-500" size={24} />
          </div>
        )}

        {/* Phase 2 placeholder for Bezier envelope overlay */}
        <div className="absolute top-2 right-2 text-[10px] text-neutral-700 font-mono">
          {envelopeMode} view
        </div>
      </div>
    </div>
  );
};
