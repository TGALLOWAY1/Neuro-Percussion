/**
 * DragWavHandle — drag-to-DAW component.
 * Allows users to drag the current audio as a WAV file to their DAW.
 * Uses the HTML5 Drag and Drop API with client-side WAV encoding.
 */

"use client";

import React, { useCallback } from "react";
import { GripVertical } from "lucide-react";
import { audioBufferToWav } from "@/lib/wavEncoder";

interface DragWavHandleProps {
  audioBuffer: AudioBuffer | null;
  instrument: string;
  seed: number;
}

export const DragWavHandle: React.FC<DragWavHandleProps> = ({
  audioBuffer,
  instrument,
  seed,
}) => {
  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!audioBuffer) {
        e.preventDefault();
        return;
      }

      const wav = audioBufferToWav(audioBuffer);
      const fileName = `neuro_${instrument}_${seed}.wav`;

      // Create a File from the Blob
      const file = new File([wav], fileName, { type: "audio/wav" });

      // Set the drag data
      e.dataTransfer.setData("text/plain", fileName);
      e.dataTransfer.effectAllowed = "copy";

      // Some DAWs support file items directly
      if (e.dataTransfer.items) {
        e.dataTransfer.items.add(file);
      }
    },
    [audioBuffer, instrument, seed]
  );

  const hasAudio = audioBuffer !== null;

  return (
    <div
      draggable={hasAudio}
      onDragStart={handleDragStart}
      className={`flex items-center gap-1 px-2 py-1.5 rounded border text-xs font-mono transition-colors ${
        hasAudio
          ? "border-neutral-700 bg-neutral-800 text-neutral-300 cursor-grab hover:border-emerald-600 hover:text-emerald-400 active:cursor-grabbing"
          : "border-neutral-800 bg-neutral-900 text-neutral-700 cursor-not-allowed"
      }`}
      title={hasAudio ? "Drag to DAW" : "Generate a sound first"}
    >
      <GripVertical size={12} />
      <span>WAV</span>
    </div>
  );
};
