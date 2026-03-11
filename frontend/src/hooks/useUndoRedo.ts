/**
 * Undo/Redo hook using zundo temporal middleware.
 * Tracks envelope params, macro params, and bezier envelope changes.
 * Phase 6: Polish & Performance.
 */

"use client";

import { create } from "zustand";
import { temporal } from "zundo";
import { usePercussionStore } from "@/store/usePercussionStore";
import { useCallback, useEffect, useRef } from "react";

interface UndoState {
  params: Record<string, number>;
  envelopeParams: Record<string, number>;
  seed: number;
}

/**
 * Temporal store that snapshots the percussion state for undo/redo.
 */
const useUndoStore = create<UndoState>()(
  temporal(
    () => ({
      params: {},
      envelopeParams: {},
      seed: 42,
    }),
    {
      limit: 50,
      equality: (a, b) =>
        JSON.stringify(a.params) === JSON.stringify(b.params) &&
        JSON.stringify(a.envelopeParams) === JSON.stringify(b.envelopeParams) &&
        a.seed === b.seed,
    }
  )
);

/**
 * Hook that provides undo/redo functionality.
 * Automatically tracks state changes from the main percussion store.
 */
export function useUndoRedo() {
  const isRestoring = useRef(false);

  // Subscribe to main store changes and snapshot them
  useEffect(() => {
    const unsub = usePercussionStore.subscribe(
      (state) => {
        if (isRestoring.current) return;
        useUndoStore.setState({
          params: { ...state.params },
          envelopeParams: { ...state.envelopeParams },
          seed: state.seed,
        });
      }
    );
    return unsub;
  }, []);

  const undo = useCallback(() => {
    const temporal = useUndoStore.temporal.getState();
    if (temporal.pastStates.length === 0) return;

    isRestoring.current = true;
    temporal.undo();

    // Apply the undo state back to the main store
    const snapshot = useUndoStore.getState();
    const store = usePercussionStore.getState();

    // Update params and envelopes
    const updates: Record<string, number> = {};
    for (const [key, val] of Object.entries(snapshot.params)) {
      if (store.params[key] !== val) updates[key] = val;
    }
    if (Object.keys(updates).length > 0) {
      for (const [key, val] of Object.entries(updates)) {
        store.updateParam(key, val);
      }
    }

    for (const [key, val] of Object.entries(snapshot.envelopeParams)) {
      if (store.envelopeParams[key] !== val) {
        store.updateEnvelopeParam(key, val);
      }
    }

    store.syncBezierFromParams();

    setTimeout(() => {
      isRestoring.current = false;
    }, 100);
  }, []);

  const redo = useCallback(() => {
    const temporal = useUndoStore.temporal.getState();
    if (temporal.futureStates.length === 0) return;

    isRestoring.current = true;
    temporal.redo();

    const snapshot = useUndoStore.getState();
    const store = usePercussionStore.getState();

    for (const [key, val] of Object.entries(snapshot.params)) {
      if (store.params[key] !== val) {
        store.updateParam(key, val);
      }
    }
    for (const [key, val] of Object.entries(snapshot.envelopeParams)) {
      if (store.envelopeParams[key] !== val) {
        store.updateEnvelopeParam(key, val);
      }
    }

    store.syncBezierFromParams();

    setTimeout(() => {
      isRestoring.current = false;
    }, 100);
  }, []);

  const temporal = useUndoStore.temporal.getState();

  return {
    undo,
    redo,
    canUndo: temporal.pastStates.length > 0,
    canRedo: temporal.futureStates.length > 0,
  };
}
