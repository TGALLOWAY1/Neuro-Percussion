"use client";

import React from "react";
import { InstrumentType } from "@/types";
import { RefreshCw } from "lucide-react";
import clsx from "clsx";

const INSTRUMENTS: InstrumentType[] = ["kick", "snare", "hat"];

interface HeaderBarProps {
    instrument: InstrumentType;
    onSwitchInstrument: (inst: InstrumentType) => void;
    seed: number;
    isLoading: boolean;
    onGenerate: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
    instrument,
    onSwitchInstrument,
    seed,
    isLoading,
    onGenerate,
}) => {
    return (
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800 bg-neutral-950 shrink-0">
            {/* Left: Logo */}
            <h1 className="text-lg font-bold text-white tracking-tight">
                Neuro-Percussion
            </h1>

            {/* Center: Instrument tabs */}
            <div className="flex bg-neutral-900 rounded-lg p-1 gap-1">
                {INSTRUMENTS.map((inst) => (
                    <button
                        key={inst}
                        onClick={() => onSwitchInstrument(inst)}
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

            {/* Right: Seed + Render */}
            <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-neutral-600">
                    #{seed}
                </span>
                <button
                    onClick={onGenerate}
                    disabled={isLoading}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors uppercase tracking-wider"
                >
                    {isLoading ? (
                        <RefreshCw size={14} className="animate-spin" />
                    ) : (
                        <RefreshCw size={14} />
                    )}
                    Generate
                </button>
            </div>
        </div>
    );
};
