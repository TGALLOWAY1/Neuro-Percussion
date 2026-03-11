# KICK REGEN — Codebase Audit & Architecture Plan

## 1. Codebase & Architecture Verdict

### What Stays

**Python DSP Engine (`engine/`) — KEEP, iterate.**
The synthesis pipeline is well-structured: per-layer ADSR envelopes, biquad filters, 4x oversampling with anti-alias on the kick, `LayerMixer` with gain/mute per stem, and `PostChain` for master processing. The `KickEngine` has a sophisticated FM-physics model with filtered noise clicks, pitch envelopes, EQ scooping, and compression. The ML preference model (RandomForest + multi-armed bandit sampler) is a clean, functional MVP for the Regenerator concept.

**Parameter Contract System (`frontend/src/audio/`) — KEEP as-is.**
Spec-driven parameter system (`ParamSpec` → `EnvelopeSpec` → `DrumParamSpec`), canonical patch migration path (`StoredPatch → migrateToCanonical → CanonicalPatch → mapToEngineParams`), unit conversions at boundaries, dev-mode control audits, and 12 test files covering conformance, mapping coverage, hydration, and regression. This is the backbone.

**Spec-Driven UI Architecture — KEEP the pattern.**
All controls rendered from `ParamSpec`/`EnvelopeSpec`. Adding a new parameter is a one-line spec change.

### What Must Change

1. **EnvelopeGraph is a static thumbnail, not an editor (REWRITE):** 200x60px SVG, straight-line segments, no Bezier curves, no drag handlers. Needs complete rewrite as the central visual feature.

2. **No real-time waveform rendering (BUILD):** `WaveformViewer` uses wavesurfer.js for post-render bar charts. Target requires real-time waveform underneath the envelope curve. Needs custom Canvas2D renderer.

3. **AuditionView is a 512-line god component (DECOMPOSE):** All state, handlers, keyboard shortcuts, and UI in one component. No state management library. Will collapse under Bezier editor + layers + drag-to-DAW weight.

4. **Layout doesn't match target (REBUILD):** Current two-column "Audition + Kit Builder" vs. target four-panel Kick 2-inspired layout.

5. **All synthesis is server-side (ARCHITECTURE DECISION):** 300ms debounced HTTP POST per parameter change. Unacceptable for real-time sound design.

6. **No click layer sample management (MISSING):** Target has 3 sample-based Click layers. No sample upload or selection exists.

### What Goes

- `wavesurfer.js` dependency → custom canvas renderer
- `WaveformViewer.tsx` → replace entirely
- `EnvelopeGraph.tsx` → replace entirely
- Two-column layout → four-panel target layout

---

## 2. Tech Stack Finalization

| Layer | Technology | Status |
|-------|-----------|--------|
| Framework | Next.js 16 + React 19 | Keep |
| State | Zustand + immer + temporal middleware | **Add** |
| Envelope Editor | Canvas2D with requestAnimationFrame | **Build** |
| Waveform Renderer | Canvas2D (shared canvas with envelope) | **Build** |
| Audio Preview | Web Audio API (lightweight client synth) | **Build (Phase 5)** |
| Audio Render | Python FastAPI + PyTorch (server) | Keep |
| Styling | Tailwind CSS 4 | Keep |
| ML/Regenerator | scikit-learn (server) | Keep |
| Testing | Vitest | Keep + expand |
| Audio Playback | Web Audio API AudioBufferSourceNode (replace wavesurfer.js) | **Replace** |

### Key Decisions

**State: Zustand** — ~1KB, `subscribe` API for non-React consumers (canvas/WebAudio), supports immer + temporal middleware for undo/redo. Right tool for a real-time creative app.

**Audio: Hybrid Architecture** — Client-side Web Audio API preview for instant feedback during editing, server-side Python render for high-fidelity output. Avoids rewriting the entire DSP engine in Rust/WASM.

**Rendering: Canvas2D** — SVG can't handle 60fps drag updates + 48K-sample waveform rendering. Canvas2D with requestAnimationFrame is the standard for audio editor UIs.

---

## 3. Master Implementation Plan

### Phase 0: Foundation & Store (Week 1)
- Install Zustand + immer middleware
- Define core store shape (params, envelope, kit, audioBuffer, bezier nodes)
- Migrate AuditionView state into Zustand store
- Replace wavesurfer.js with `useAudioPlayback` hook (Web Audio API)
- Run existing tests

### Phase 1: Four-Panel Layout Shell (Week 1-2)
- Build four-panel layout: TopNav, RegenPanel, LayersPanel, VisualEditor
- Wire up SUB layer tab with existing param controls
- Implement PITCH/AMP mode toggle
- Stub out Click layer tabs

### Phase 2: Bezier Envelope Canvas (Week 2-3) — CRITICAL PATH ✅
- ✅ Build `BezierEnvelopeCanvas` component (Canvas2D)
- ✅ Implement node interaction (drag, add/remove, double-click)
- ✅ Implement Bezier math and curve↔params conversion (24 tests)
- ✅ Render waveform underneath envelope curve
- ✅ Add TIMING master fader

### Phase 3: Regenerator Module (Week 3-4) ✅
- ✅ "Roll Dice" (high-entropy randomization — all macros + envelopes + seed)
- ✅ "Smart Mutate" (constrained jitter with configurable amount)
- ✅ Parameter focus dropdown (per-envelope group + macros)
- ✅ Feedback integration (thumbs up/down with history tracking)

### Phase 4: Audio Export & Click Layers (Week 4-5) ✅
- ✅ "SAVE WAV" high-quality render (server-side, download trigger)
- ✅ "Drag WAV" handle for DAW integration (client-side 16-bit PCM encoding)
- ✅ Click layer system (9 built-in transient samples, per-layer gain/enable)
- ✅ Kit export (existing functionality preserved)

### Phase 5: Client-Side Preview Engine (Week 5-6) ✅
- ✅ Build `PreviewEngine` using Web Audio API (OscillatorNode + GainNode + noise burst)
- ✅ Wire to Bezier editor for instant feedback (onDragEnd callback)
- ✅ Hybrid render flow (preview during edit, server render on idle via debounce)
- ✅ Preview toggle button in VisualEditorPanel

### Phase 6: Polish & Performance (Week 6-7) ✅
- ✅ Undo/Redo (zundo temporal middleware, 50-state history)
- ✅ Keyboard shortcuts expansion (Ctrl+Z, Ctrl+Shift+Z, Ctrl+S)
- ✅ Responsive canvas + DPI scaling (ResizeObserver + devicePixelRatio)
- ✅ Select element exclusion for keyboard shortcuts

### Critical Path
```
Phase 0 (Store) → Phase 1 (Layout) → Phase 2 (Bezier Canvas) → Phase 3 (Regenerator)
                                              │
                                              └→ Phase 4 (Export + Clicks)
                                                        │
                                                        └→ Phase 5 (Preview Engine)
                                                                   │
                                                                   └→ Phase 6 (Polish)
```

The Bezier Canvas (Phase 2) is the linchpin. Build a standalone prototype first and benchmark before integrating.
