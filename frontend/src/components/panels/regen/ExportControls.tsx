"use client";

import React from "react";
import { DragWavHandle } from "../../DragWavHandle";
import { RefreshCw, Download, Plus, Check, Save } from "lucide-react";
import clsx from "clsx";
import type { InstrumentType } from "@/types";

interface Props {
  instrument: InstrumentType;
  seed: number;
  isLoading: boolean;
  isExporting: boolean;
  audioUrl: string | null;
  audioBuffer: AudioBuffer | null;
  inKit: boolean;
  kitSize: number;
  onSaveWav: () => void;
  onAddToKit: () => void;
  onExportKit: () => void;
}

export const ExportControls: React.FC<Props> = ({
  instrument,
  seed,
  isLoading,
  isExporting,
  audioUrl,
  audioBuffer,
  inKit,
  kitSize,
  onSaveWav,
  onAddToKit,
  onExportKit,
}) => (
  <>
    {/* Save WAV */}
    <button
      onClick={onSaveWav}
      disabled={isLoading || !audioUrl}
      className="flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white font-semibold py-2 px-3 rounded-lg transition-colors"
      title="Save WAV (high-quality render)"
    >
      <Save size={14} />
      Save
    </button>

    {/* Drag WAV handle */}
    <DragWavHandle
      audioBuffer={audioBuffer}
      instrument={instrument}
      seed={seed}
    />

    {/* Add to kit */}
    <button
      onClick={onAddToKit}
      className={clsx(
        "p-2 rounded-lg transition-colors",
        inKit
          ? "bg-emerald-900/50 text-emerald-500 border border-emerald-500/50"
          : "bg-neutral-800 hover:bg-neutral-700 text-white"
      )}
      title="Add to Kit"
    >
      {inKit ? <Check size={16} /> : <Plus size={16} />}
    </button>

    {/* Export Kit */}
    <button
      onClick={onExportKit}
      disabled={kitSize === 0 || isExporting}
      className="flex items-center gap-1.5 bg-white text-black font-bold py-2 px-4 rounded-lg hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {isExporting ? (
        <RefreshCw className="animate-spin" size={14} />
      ) : (
        <Download size={14} />
      )}
      Export
    </button>
  </>
);
