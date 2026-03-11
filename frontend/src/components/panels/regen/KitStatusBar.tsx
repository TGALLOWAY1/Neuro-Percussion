"use client";

import React from "react";
import clsx from "clsx";
import type { InstrumentType } from "@/types";
import type { KitSlot } from "@/store/usePercussionStore";

const INSTRUMENTS: InstrumentType[] = ["kick", "snare", "hat"];

interface Props {
  kit: Partial<Record<InstrumentType, KitSlot>>;
}

export const KitStatusBar: React.FC<Props> = ({ kit }) => (
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
);
