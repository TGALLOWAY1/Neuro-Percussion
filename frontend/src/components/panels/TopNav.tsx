/**
 * TopNav — instrument selector tabs + app title.
 */

"use client";

import React from "react";
import { usePercussionStore } from "@/store/usePercussionStore";
import type { InstrumentType } from "@/types";
import clsx from "clsx";

const INSTRUMENTS: InstrumentType[] = ["kick", "snare", "hat"];

export const TopNav: React.FC = () => {
  const instrument = usePercussionStore((s) => s.instrument);
  const switchInstrument = usePercussionStore((s) => s.switchInstrument);

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-neutral-800 bg-neutral-950 flex-shrink-0">
      <h1 className="text-lg font-bold text-white tracking-tight">
        Neuro-Percussion
      </h1>

      <div className="flex bg-neutral-900 rounded-lg p-1 gap-1">
        {INSTRUMENTS.map((inst) => (
          <button
            key={inst}
            onClick={() => switchInstrument(inst)}
            className={clsx(
              "px-4 py-1.5 text-xs font-semibold rounded-md uppercase tracking-wider transition-all",
              instrument === inst
                ? "bg-emerald-600 text-white shadow-lg"
                : "text-neutral-500 hover:text-neutral-300"
            )}
          >
            {inst}
          </button>
        ))}
      </div>

      <div className="text-xs text-neutral-600 font-mono">
        v0.2.0
      </div>
    </header>
  );
};
