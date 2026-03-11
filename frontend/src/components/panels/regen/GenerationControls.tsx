"use client";

import React from "react";
import type { MutationFocus } from "@/store/usePercussionStore";
import { Dice5, Wand2, Play, Sparkles } from "lucide-react";

interface Props {
  seed: number;
  isLoading: boolean;
  mutationFocus: MutationFocus;
  mutationAmount: number;
  focusOptions: { value: MutationFocus; label: string }[];
  onRollDice: () => void;
  onSmartMutate: () => void;
  onReplay: () => void;
  onAiSuggest: () => void;
  onSetMutationFocus: (focus: MutationFocus) => void;
  onSetMutationAmount: (amount: number) => void;
}

export const GenerationControls: React.FC<Props> = ({
  seed,
  isLoading,
  mutationFocus,
  mutationAmount,
  focusOptions,
  onRollDice,
  onSmartMutate,
  onReplay,
  onAiSuggest,
  onSetMutationFocus,
  onSetMutationAmount,
}) => (
  <>
    {/* Roll Dice */}
    <button
      onClick={onRollDice}
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

    {/* Smart Mutate */}
    <button
      onClick={onSmartMutate}
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
        onChange={(e) => onSetMutationFocus(e.target.value as MutationFocus)}
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
        onChange={(e) => onSetMutationAmount(Number(e.target.value))}
        className="w-16 h-1 accent-amber-500"
      />
      <span className="text-[10px] text-amber-400 font-mono w-8">
        {Math.round(mutationAmount * 100)}%
      </span>
    </div>

    {/* Replay */}
    <button
      onClick={onReplay}
      className="p-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors"
      title="Replay (Space)"
    >
      <Play size={16} />
    </button>

    {/* AI Suggest */}
    <button
      onClick={onAiSuggest}
      disabled={isLoading}
      className="flex items-center gap-1.5 text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors uppercase tracking-wider px-3 py-2"
      title="AI Suggest (M)"
    >
      <Sparkles size={14} />
      Suggest
    </button>
  </>
);
