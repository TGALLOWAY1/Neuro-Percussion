/**
 * RegenPanel — bottom bar orchestrator.
 * Composes: GenerationControls, FeedbackControls, ExportControls, MacroGrid, KitStatusBar.
 */

"use client";

import React from "react";
import { usePercussionStore, type MutationFocus } from "@/store/usePercussionStore";
import { useAudioPlayback } from "@/hooks/useAudioPlayback";
import { getEnvelopeSpec } from "@/audio/params";
import type { InstrumentType } from "@/types";
import { GenerationControls } from "./regen/GenerationControls";
import { FeedbackControls } from "./regen/FeedbackControls";
import { ExportControls } from "./regen/ExportControls";
import { MacroGrid } from "./regen/MacroGrid";
import { KitStatusBar } from "./regen/KitStatusBar";

/** Available mutation focus options (filtered by current instrument's envelopes) */
function getMutationFocusOptions(instrument: InstrumentType): { value: MutationFocus; label: string }[] {
  const spec = getEnvelopeSpec(instrument);
  const opts: { value: MutationFocus; label: string }[] = [
    { value: "all", label: "All" },
  ];
  for (const env of spec.envelopes) {
    opts.push({ value: env.id as MutationFocus, label: env.label });
  }
  if (spec.macroParams && spec.macroParams.length > 0) {
    opts.push({ value: "macros", label: "Macros" });
  }
  return opts;
}

export const RegenPanel: React.FC = () => {
  const instrument = usePercussionStore((s) => s.instrument);
  const params = usePercussionStore((s) => s.params);
  const seed = usePercussionStore((s) => s.seed);
  const feedbackSent = usePercussionStore((s) => s.feedbackSent);
  const kit = usePercussionStore((s) => s.kit);
  const isExporting = usePercussionStore((s) => s.isExporting);
  const isLoading = usePercussionStore((s) => s.isLoading);
  const mutationFocus = usePercussionStore((s) => s.mutationFocus);
  const mutationAmount = usePercussionStore((s) => s.mutationAmount);
  const audioUrl = usePercussionStore((s) => s.audioUrl);

  const updateParam = usePercussionStore((s) => s.updateParam);
  const generate = usePercussionStore((s) => s.generate);
  const submitFeedback = usePercussionStore((s) => s.submitFeedback);
  const aiSuggest = usePercussionStore((s) => s.aiSuggest);
  const addToKit = usePercussionStore((s) => s.addToKit);
  const exportCurrentKit = usePercussionStore((s) => s.exportCurrentKit);
  const rollDice = usePercussionStore((s) => s.rollDice);
  const smartMutate = usePercussionStore((s) => s.smartMutate);
  const setMutationFocus = usePercussionStore((s) => s.setMutationFocus);
  const setMutationAmount = usePercussionStore((s) => s.setMutationAmount);
  const saveWav = usePercussionStore((s) => s.saveWav);

  const { audioBuffer } = useAudioPlayback(audioUrl);
  const spec = getEnvelopeSpec(instrument);
  const macroParams = spec.macroParams ?? [];
  const inKit = kit[instrument]?.seed === seed;
  const focusOptions = getMutationFocusOptions(instrument);

  return (
    <div className="px-6 py-4 flex flex-col gap-4">
      {/* Top row: generation + mutation + feedback + export */}
      <div className="flex items-center gap-3">
        <GenerationControls
          seed={seed}
          isLoading={isLoading}
          mutationFocus={mutationFocus}
          mutationAmount={mutationAmount}
          focusOptions={focusOptions}
          onRollDice={rollDice}
          onSmartMutate={smartMutate}
          onReplay={() => generate()}
          onAiSuggest={aiSuggest}
          onSetMutationFocus={setMutationFocus}
          onSetMutationAmount={setMutationAmount}
        />

        {/* Spacer */}
        <div className="flex-1" />

        <FeedbackControls
          feedbackSent={feedbackSent}
          onSubmitFeedback={submitFeedback}
        />

        <ExportControls
          instrument={instrument}
          seed={seed}
          isLoading={isLoading}
          isExporting={isExporting}
          audioUrl={audioUrl}
          audioBuffer={audioBuffer}
          inKit={inKit}
          kitSize={Object.keys(kit).length}
          onSaveWav={saveWav}
          onAddToKit={addToKit}
          onExportKit={exportCurrentKit}
        />
      </div>

      <MacroGrid
        macroParams={macroParams}
        values={params}
        onUpdateParam={updateParam}
      />

      <KitStatusBar kit={kit} />
    </div>
  );
};
