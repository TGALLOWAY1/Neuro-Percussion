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
import { ErrorBoundary } from "../ErrorBoundary";
import { ErrorToast } from "../ErrorToast";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

export const AppShell: React.FC = () => {
  useKeyboardShortcuts();

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen max-h-screen bg-black text-neutral-200 overflow-hidden">
        {/* Skip link for keyboard users */}
        <a
          href="#main-editor"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-emerald-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-md focus:top-2 focus:left-2"
        >
          Skip to editor
        </a>

        {/* Top Nav */}
        <TopNav />

        {/* Main Content */}
        <div className="flex flex-1 min-h-0">
          {/* Left: Layers Panel */}
          <aside
            className="w-72 flex-shrink-0 border-r border-neutral-800 overflow-y-auto"
            aria-label="Layer parameters"
          >
            <LayersPanel />
          </aside>

          {/* Right: Visual Editor + Regen */}
          <main id="main-editor" className="flex-1 flex flex-col min-w-0">
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

        {/* Error toast for API/store errors */}
        <ErrorToast />
      </div>
    </ErrorBoundary>
  );
};
