/**
 * VSTActionBar — compact bottom bar with generation, feedback, and export controls.
 */

"use client";

import React from "react";
import { usePercussionStore, type MutationFocus } from "@/store/usePercussionStore";
import { useAudioPlayback } from "@/hooks/useAudioPlayback";
import { getEnvelopeSpec } from "@/audio/params";
import type { InstrumentType } from "@/types";
import { GenerationControls } from "./panels/regen/GenerationControls";
import { FeedbackControls } from "./panels/regen/FeedbackControls";
import { ExportControls } from "./panels/regen/ExportControls";
import { KitStatusBar } from "./panels/regen/KitStatusBar";

function getMutationFocusOptions(instrument: InstrumentType): { value: MutationFocus; label: string }[] {
  const spec = getEnvelopeSpec(instrument);
  const opts: { value: MutationFocus; label: string }[] = [{ value: "all", label: "All" }];
  for (const env of spec.envelopes) {
    opts.push({ value: env.id as MutationFocus, label: env.label });
  }
  if (spec.macroParams && spec.macroParams.length > 0) {
    opts.push({ value: "macros", label: "Macros" });
  }
  return opts;
}

export const VSTActionBar: React.FC = () => {
  const instrument = usePercussionStore((s) => s.instrument);
  const params = usePercussionStore((s) => s.params);
  const seed = usePercussionStore((s) => s.seed);
  const lastFeedbackLabel = usePercussionStore((s) => s.lastFeedbackLabel);
  const kit = usePercussionStore((s) => s.kit);
  const isExporting = usePercussionStore((s) => s.isExporting);
  const isLoading = usePercussionStore((s) => s.isLoading);
  const mutationTarget = usePercussionStore((s) => s.mutationTarget);
  const mutationAmount = usePercussionStore((s) => s.mutationAmount);
  const audioUrl = usePercussionStore((s) => s.audioUrl);

  const updateParam = usePercussionStore((s) => s.updateParam);
  const generate = usePercussionStore((s) => s.generate);
  const submitFeedback = usePercussionStore((s) => s.submitFeedback);
  const aiSuggest = usePercussionStore((s) => s.aiSuggest);
  const addToKit = usePercussionStore((s) => s.addToKit);
  const exportCurrentKit = usePercussionStore((s) => s.exportCurrentKit);
  const randomizeAll = usePercussionStore((s) => s.randomizeAll);
  const mutateParams = usePercussionStore((s) => s.mutateParams);
  const setMutationTarget = usePercussionStore((s) => s.setMutationTarget);
  const setMutationAmount = usePercussionStore((s) => s.setMutationAmount);
  const saveWav = usePercussionStore((s) => s.saveWav);

  const { audioBuffer } = useAudioPlayback(audioUrl);
  const inKit = kit[instrument]?.seed === seed;
  const focusOptions = getMutationFocusOptions(instrument);

  return (
    <div className="px-4 py-3 flex flex-col gap-2 border-t border-neutral-800 bg-neutral-950">
      <div className="flex items-center gap-3 flex-wrap">
        <GenerationControls
          seed={seed}
          isLoading={isLoading}
          mutationTarget={mutationTarget}
          mutationAmount={mutationAmount}
          focusOptions={focusOptions}
          onRandomizeAll={randomizeAll}
          onMutateParams={mutateParams}
          onReplay={() => generate()}
          onAiSuggest={aiSuggest}
          onSetMutationTarget={setMutationTarget}
          onSetMutationAmount={setMutationAmount}
        />
        <div className="flex-1" />
        <FeedbackControls
          lastFeedbackLabel={lastFeedbackLabel}
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
      <KitStatusBar kit={kit} />
    </div>
  );
};
