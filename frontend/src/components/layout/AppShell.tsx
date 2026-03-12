/**
 * VST-style layout shell.
 *
 * Layout:
 * ┌───────────────────────────────────────────────┐
 * │  TopNav (instrument tabs + title)              │
 * ├──────────────────────┬────────────────────────┤
 * │  AMP Bezier Canvas   │  PITCH Bezier Canvas   │
 * │  (waveform overlay)  │  (envelope curve)      │
 * ├──────────────────────┴────────────────────────┤
 * │ ┌──CLICK──┐ ┌──OUTPUT──┐ ┌──ROOM──────────┐  │
 * │ │ (o)(o)  │ │ (o)(o)   │ │ (o)(o)(o)(o)   │  │
 * │ └─────────┘ └──────────┘ └────────────────┘  │
 * ├───────────────────────────────────────────────┤
 * │  [Roll] [Mutate] [▶] [✨]   [👍👎] [Export]  │
 * │  Kit: kick ✓  snare —  hat —                  │
 * └───────────────────────────────────────────────┘
 */

"use client";

import React from "react";
import { TopNav } from "../panels/TopNav";
import { VSTEnvelopeStrip } from "../VSTEnvelopeStrip";
import { VSTParamSections } from "../VSTParamSections";
import { VSTActionBar } from "../VSTActionBar";
import { ErrorBoundary } from "../ErrorBoundary";
import { ErrorToast } from "../ErrorToast";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { RefreshCw } from "lucide-react";
import { usePercussionStore } from "@/store/usePercussionStore";

export const AppShell: React.FC = () => {
  useKeyboardShortcuts();
  const isLoading = usePercussionStore((s) => s.isLoading);

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen max-h-screen bg-black text-neutral-200 overflow-hidden">
        {/* Skip link */}
        <a
          href="#main-editor"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-emerald-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-md focus:top-2 focus:left-2"
        >
          Skip to editor
        </a>

        {/* Header */}
        <TopNav />

        {/* Main scrollable content */}
        <main
          id="main-editor"
          className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 p-4"
        >
          {/* Envelope canvases (AMP + PITCH side by side) */}
          <div className="relative">
            <VSTEnvelopeStrip />
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm rounded-lg pointer-events-none">
                <RefreshCw className="animate-spin text-emerald-500" size={24} />
              </div>
            )}
          </div>

          {/* Parameter section panels with knobs */}
          <VSTParamSections />
        </main>

        {/* Action bar */}
        <VSTActionBar />

        <ErrorToast />
      </div>
    </ErrorBoundary>
  );
};
