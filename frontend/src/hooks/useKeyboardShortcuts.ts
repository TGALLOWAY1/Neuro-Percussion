/**
 * Keyboard shortcuts hook — global keyboard event handler.
 * Phase 6: Expanded shortcuts with undo/redo.
 */

import { useEffect } from "react";
import { usePercussionStore } from "@/store/usePercussionStore";
import { useUndoRedo } from "./useUndoRedo";
import type { InstrumentType } from "@/types";

const INSTRUMENTS: InstrumentType[] = ["kick", "snare", "hat"];

export function useKeyboardShortcuts() {
  const instrument = usePercussionStore((s) => s.instrument);
  const { undo, redo } = useUndoRedo();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;

      const store = usePercussionStore.getState();

      // Undo/Redo (Ctrl/Cmd + Z / Ctrl/Cmd + Shift + Z)
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      switch (e.code) {
        case "Space":
          e.preventDefault();
          store.generate();
          break;
        case "Enter":
        case "KeyN":
          e.preventDefault();
          store.rollDice();
          break;
        case "KeyR":
          e.preventDefault();
          store.smartMutate();
          break;
        case "ArrowRight": {
          e.preventDefault();
          const idx = INSTRUMENTS.indexOf(store.instrument);
          const nextIdx = (idx + 1) % INSTRUMENTS.length;
          store.switchInstrument(INSTRUMENTS[nextIdx]);
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          const prevIdx =
            (INSTRUMENTS.indexOf(store.instrument) - 1 + INSTRUMENTS.length) %
            INSTRUMENTS.length;
          store.switchInstrument(INSTRUMENTS[prevIdx]);
          break;
        }
        case "KeyM":
          store.aiSuggest();
          break;
        case "KeyS":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            store.saveWav();
          }
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [instrument, undo, redo]);
}
