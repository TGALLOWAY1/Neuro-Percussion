/**
 * Four-panel layout shell (Phase 1).
 *
 * Layout:
 * ┌─────────────────────────────────────────────┐
 * │  TopNav (instrument tabs + title)            │
 * ├──────────────┬──────────────────────────────┤
 * │  LayersPanel │  VisualEditor (waveform +    │
 * │  (SUB/CLICK  │   envelope graph area)       │
 * │   tabs +     │                              │
 * │   params)    ├──────────────────────────────┤
 * │              │  RegenPanel (generate/kit/   │
 * │              │   feedback/macros)           │
 * ├──────────────┴──────────────────────────────┤
 * └─────────────────────────────────────────────┘
 */

"use client";

import React from "react";
import { TopNav } from "../panels/TopNav";
import { LayersPanel } from "../panels/LayersPanel";
import { VisualEditorPanel } from "../panels/VisualEditorPanel";
import { RegenPanel } from "../panels/RegenPanel";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

export const AppShell: React.FC = () => {
  useKeyboardShortcuts();

  return (
    <div className="flex flex-col h-screen max-h-screen bg-black text-neutral-200 overflow-hidden">
      {/* Top Nav */}
      <TopNav />

      {/* Main Content */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Layers Panel */}
        <aside className="w-72 flex-shrink-0 border-r border-neutral-800 overflow-y-auto">
          <LayersPanel />
        </aside>

        {/* Right: Visual Editor + Regen */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Visual Editor (waveform + envelope) */}
          <div className="flex-1 min-h-0 p-4">
            <VisualEditorPanel />
          </div>

          {/* Bottom: Regen Panel */}
          <div className="flex-shrink-0 border-t border-neutral-800">
            <RegenPanel />
          </div>
        </main>
      </div>
    </div>
  );
};
