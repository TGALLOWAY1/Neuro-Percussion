/**
 * RegenPanel — bottom bar with regenerator controls, mutation settings,
 * macro sliders, ML feedback, and kit management.
 * Phase 3: Roll Dice, Smart Mutate, parameter focus, mutation amount.
 */

"use client";

import React from "react";
import { usePercussionStore, type MutationFocus } from "@/store/usePercussionStore";
import { MacroSlider } from "../MacroSlider";
import { getEnvelopeSpec } from "@/audio/params";
import type { InstrumentType } from "@/types";
import {
  RefreshCw,
  Play,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Download,
  Plus,
  Check,
  Dice5,
  Wand2,
} from "lucide-react";
import clsx from "clsx";

const INSTRUMENTS: InstrumentType[] = ["kick", "snare", "hat"];

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

  const spec = getEnvelopeSpec(instrument);
  const macroParams = spec.macroParams ?? [];
  const inKit = kit[instrument]?.seed === seed;
  const focusOptions = getMutationFocusOptions(instrument);

  return (
    <div className="px-6 py-4 flex flex-col gap-4">
      {/* Top row: generation + mutation controls */}
      <div className="flex items-center gap-3">
        {/* Roll Dice — full random */}
        <button
          onClick={rollDice}
          disabled={isLoading}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
          title="Roll Dice — full random (Enter/N)"
        >
          <Dice5 size={16} />
          Roll
          <span className="text-emerald-200 text-xs font-mono opacity-70">
            #{seed}
          </span>
        </button>

        {/* Smart Mutate — constrained */}
        <button
          onClick={smartMutate}
          disabled={isLoading}
          className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold py-2 px-3 rounded-lg transition-colors"
          title="Smart Mutate — tweak current sound"
        >
          <Wand2 size={16} />
          Mutate
        </button>

        {/* Mutation focus dropdown */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-neutral-500 font-mono uppercase">Focus:</span>
          <select
            value={mutationFocus}
            onChange={(e) => setMutationFocus(e.target.value as MutationFocus)}
            className="bg-neutral-800 text-neutral-300 text-xs rounded px-2 py-1.5 border border-neutral-700 focus:border-emerald-600 outline-none"
          >
            {focusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Mutation amount slider */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-neutral-500 font-mono uppercase">Amt:</span>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={mutationAmount}
            onChange={(e) => setMutationAmount(Number(e.target.value))}
            className="w-16 h-1 accent-amber-500"
          />
          <span className="text-[10px] text-amber-400 font-mono w-8">
            {Math.round(mutationAmount * 100)}%
          </span>
        </div>

        {/* Replay */}
        <button
          onClick={() => generate()}
          className="p-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors"
          title="Replay (Space)"
        >
          <Play size={16} />
        </button>

        {/* AI Suggest */}
        <button
          onClick={aiSuggest}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors uppercase tracking-wider px-3 py-2"
          title="AI Suggest (M)"
        >
          <Sparkles size={14} />
          Suggest
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Feedback */}
        <div className="flex gap-1">
          <button
            onClick={() => submitFeedback(0)}
            disabled={feedbackSent !== null}
            className={clsx(
              "p-2 rounded hover:bg-neutral-800 transition-colors",
              feedbackSent === 0 ? "text-red-500" : "text-neutral-500"
            )}
            title="Bad sound"
          >
            <ThumbsDown size={16} />
          </button>
          <button
            onClick={() => submitFeedback(1)}
            disabled={feedbackSent !== null}
            className={clsx(
              "p-2 rounded hover:bg-neutral-800 transition-colors",
              feedbackSent === 1 ? "text-emerald-500" : "text-neutral-500"
            )}
            title="Good sound"
          >
            <ThumbsUp size={16} />
          </button>
        </div>

        {/* Add to kit */}
        <button
          onClick={addToKit}
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
          onClick={exportCurrentKit}
          disabled={Object.keys(kit).length === 0 || isExporting}
          className="flex items-center gap-1.5 bg-white text-black font-bold py-2 px-4 rounded-lg hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isExporting ? (
            <RefreshCw className="animate-spin" size={14} />
          ) : (
            <Download size={14} />
          )}
          Export
        </button>
      </div>

      {/* Macro sliders row */}
      {macroParams.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          {macroParams.map((p) => (
            <MacroSlider
              key={p.id}
              label={p.label}
              value={params[p.id] ?? p.default}
              min={p.min}
              max={p.max}
              onChange={(v) => updateParam(p.id, v)}
            />
          ))}
        </div>
      )}

      {/* Kit status bar */}
      <div className="flex items-center gap-3 text-xs text-neutral-600">
        <span className="font-semibold uppercase tracking-wider">Kit:</span>
        {INSTRUMENTS.map((inst) => (
          <span
            key={inst}
            className={clsx(
              "px-2 py-0.5 rounded font-mono",
              kit[inst] ? "text-emerald-500 bg-emerald-950" : "text-neutral-700"
            )}
          >
            {inst} {kit[inst] ? "\u2713" : "\u2014"}
          </span>
        ))}
      </div>
    </div>
  );
};
