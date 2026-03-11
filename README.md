<img width="750" height="1006" alt="image" src="https://github.com/user-attachments/assets/2756e68b-1277-4f7a-b473-bf724b6f9d12" />

# Neuro-Percussion

Neural percussion synthesizer with ML-guided sound design. Combines a Python DSP engine (FM synthesis, filtered noise, biquad filters, 4x oversampling) with a React frontend for real-time parameter editing and AI-assisted regeneration.

## Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 + React 19 |
| State | Zustand + immer middleware |
| Envelope Editor | Canvas2D (Phase 2) |
| Waveform | Canvas2D with Web Audio API playback |
| Audio Render | Python FastAPI + PyTorch (server) |
| Styling | Tailwind CSS 4 |
| ML/Regenerator | scikit-learn (server) |
| Testing | Vitest (90 tests) |

### Frontend Architecture

```
src/
├── store/
│   └── usePercussionStore.ts    # Zustand store (single source of truth)
├── hooks/
│   ├── useAudioPlayback.ts      # Web Audio API playback (replaces wavesurfer.js)
│   └── useKeyboardShortcuts.ts  # Global keyboard shortcuts
├── components/
│   ├── layout/
│   │   └── AppShell.tsx         # Four-panel layout shell
│   ├── panels/
│   │   ├── TopNav.tsx           # Instrument tabs + title
│   │   ├── LayersPanel.tsx      # Layer tabs (SUB/CLICK) + param controls
│   │   ├── VisualEditorPanel.tsx # Waveform canvas + envelope mode toggle
│   │   └── RegenPanel.tsx       # Generate/kit/feedback/macros
│   ├── envelopes/               # Envelope controls (spec-driven)
│   ├── WaveformCanvas.tsx       # Canvas2D waveform renderer
│   └── MacroSlider.tsx          # Macro parameter slider
├── audio/
│   ├── params/                  # Spec-driven parameter system
│   └── contract/                # Canonical patch → engine param mapping
└── lib/
    └── api.ts                   # Server API client
```

### Parameter Contract

Single mapping path: `StoredPatch → migrateToCanonical → CanonicalPatch → mapToEngineParams → API`

All UI controls are rendered from `ParamSpec` / `EnvelopeSpec`. Adding a new parameter is a one-line spec change.

### Four-Panel Layout

```
┌─────────────────────────────────────────────┐
│  TopNav (instrument tabs + title)            │
├──────────────┬──────────────────────────────┤
│  LayersPanel │  VisualEditor (waveform +    │
│  (SUB/CLICK  │   envelope view)             │
│   tabs +     │                              │
│   params)    ├──────────────────────────────┤
│              │  RegenPanel (controls/kit)   │
├──────────────┴──────────────────────────────┤
└─────────────────────────────────────────────┘
```

## Implementation Progress

- [x] **Phase 0**: Foundation & Store — Zustand store, Web Audio playback, Canvas2D waveform
- [x] **Phase 1**: Four-Panel Layout — AppShell, LayersPanel, VisualEditorPanel, RegenPanel, PITCH/AMP toggle, Click layer stubs
- [ ] **Phase 2**: Bezier Envelope Canvas (critical path)
- [ ] **Phase 3**: Regenerator Module
- [ ] **Phase 4**: Audio Export & Click Layers
- [ ] **Phase 5**: Client-Side Preview Engine
- [ ] **Phase 6**: Polish & Performance

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Replay current sound |
| Enter / N | Generate new (random seed + envelopes) |
| Arrow Left/Right | Switch instrument |
| M | AI Suggest (ML-guided mutation) |

## Development

```bash
# Frontend
cd frontend && npm install && npm run dev

# Engine (Python)
cd engine && pip install -r requirements.txt && python main.py

# Tests
cd frontend && npm test
```

## Engine

Python DSP engine with:
- **Kick**: FM-physics model, pitch envelopes, filtered noise clicks, sub harmonics
- **Snare**: Multi-transient shell + noise layers, body resonance
- **Hat**: Metallic ring modulation, noise shaping, envelope control
- **Post-chain**: Master EQ, compression, saturation, room reverb
- **ML**: RandomForest preference model + multi-armed bandit sampler for regeneration
