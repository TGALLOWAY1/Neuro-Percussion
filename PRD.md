# PRD: Neuro-Percussion (v1.1 - Comprehensive)

**Project:** Neuro-Percussion
**Version:** 1.1 (Full Technical Spec)
**Date:** January 25, 2026
**Status:** Ready for Development
**Owner:** TJ Galloway

---

## 1. Introduction

**Neuro-Percussion** is a procedural audio system that generates mix-ready drum kits (Kick, Snare, Hi-Hat) tailored to user taste. It leverages a **Layered Parametric Architecture** (no raw oscillators) and **Human-in-the-Loop Machine Learning** to learn aesthetic preferences.

### 1.1 Target User & Use Cases

* **Primary User:** Solo electronic music producer / sound designer.
* **Core Use Cases:**
1. **Audition:** Rapidly generate and review drum sounds via keyboard-first workflow.
2. **Learn:** System adapts to user taste via binary (Like/Dislike) feedback.
3. **Mutate:** Generate variations of a specific "liked" sound.
4. **Curate:** Assemble a cohesive kit (Kick, Snare, Hat) and export.
5. **Review:** Visualize learning progress and feature preferences.



---

## 2. Scope & Constraints

### 2.1 In-Scope (v1)

* **Synthesis:** Offline rendering to WAV using three distinct engines (Kick, Snare, Hat).
* **Quality:** "Draft" (1x sample rate) vs "High" (4x oversampled) render modes.
* **UI:** Next.js web app with keyboard-first workflow.
* **Data:** Local JSON-based dataset storage database; per-instrument preference models.
* **ML:** Active learning loop (Sampling → Feedback → Retraining).
* **Export:** Curated kit folder containing WAVs + JSON metadata + License file.

### 2.2 Out-of-Scope (v1)

* Real-time VST/AU plugin architecture.
* Cloud sync or user accounts.
* Neural audio synthesis (GANs, Diffusion, etc.) - strict DSP-only constraint.
* Multi-velocity sample packs (v1 is one-shot only).
* Mobile support.

### 2.3 System Constraints

* **Platform:** macOS (Local CPU execution).
* **Audio Format:** 48kHz / 24-bit WAV (Mono).
* **Determinism:** Audio must be bit-identical given `{seed, params, style, quality}`.
* **Performance:**
* Draft Latency: < 200ms (median).
* High Latency: < 900ms (median).
* Retraining Time: < 300ms (for N < 2000).



---

## 3. Success Criteria (Acceptance Targets)

### 3.1 Audio Quality (Hard Requirements)

* **Peak Ceiling:** Max true peak ≤ -0.8 dBFS after final soft-clip.
* **DC Offset:** Abs(mean) ≤ 1e-4.
* **Boundary Integrity:** 0.5ms fade-in, 2ms fade-out. First/Last 64 samples must approach 0.
* **Kick Balance:** Energy(20–100Hz) / Energy(20–20kHz) ratio between 0.25 – 0.85.
* **Hat Alias Proxy:** Spectral Centroid ≤ 10.5kHz (Closed Hat, non-Airy style) to prevent high-end harshness.
* **Snare Transient:** Crest Factor ≥ 8 dB (ensures dynamic "crack").

### 3.2 ML Performance

* **Convergence:** Like-rate in top-10 ranked candidates improves by ≥ +20% over random baseline after 30 labels.
* **Diversity:** Top-10 candidates must maintain Euclidean distance > 0.1 in parameter space to prevent collapse.

---

## 4. System Architecture & Interfaces

### 4.1 Data Flow

`User Input` -> `UI` -> `Sampler` -> `PreferenceModel (Query)` -> `InstrumentEngine` -> `PostChain` -> `Renderer` -> `Audio Output` -> `User Feedback` -> `DatasetStore` -> `PreferenceModel (Train)`

### 4.2 Module Interfaces

#### Types

```python
@dataclass
class AudioBuffer:
    samples: np.ndarray # float32
    sample_rate: int
    peak_dbfs: float

@dataclass
class RenderContext:
    instrument: str # "kick", "snare", "hat"
    style: str # "clean", "gritty", "aggro", "airy"
    quality: str # "draft", "high"

@dataclass
class Candidate:
    id: str # uuid
    seed: int
    dsp_params: dict
    context: RenderContext

```

#### Module Responsibilities

1. **InstrumentEngine:** Deterministic raw audio generation. Interface: `render(dsp_params, seed, sample_rate)`.
2. **PostChain:** Per-instrument dynamics, EQ, saturation. Interface: `process(buffer, context)`.
3. **Renderer:** Pipeline orchestration, trimming, normalization, export. Interface: `render_candidate(candidate)`, `export_wav(buffer, path)`.
4. **FeatureExtractor:** Compute descriptors (`spectral_centroid`, `spectral_flatness`, `temporal_centroid`, `rms`, `crest_factor`, `low_band_ratio`).
5. **PreferenceModel:** `fit(X, y)` and `predict_proba(X)`.
6. **Sampler:** `propose(context, n, exploration)` and `mutate(base, k, sigma)`.
7. **DatasetStore:** JSONL persistence.

---

## 5. DSP Specification (Detailed Engineering Spec)

**Global Requirement:** All nonlinear stages (Saturation, Clip) must be **4x Oversampled** in `High` mode using polyphase resampling.

### 5.0 Global Production Post-Chain

Every instrument passes through this chain. Parameters adapt based on the `Context.instrument` and global `Style` macro.

| Stage | Component | Configuration Logic (Per-Instrument Defaults) |
| --- | --- | --- |
| **1. Cleanup** | DC Block + HPF | **Kick:** 20Hz (preserve sub)<br>

<br>**Snare:** 90-140Hz (tighten)<br>

<br>**Hat:** 3kHz-8kHz (remove mud) |
| **2. Dynamics** | Transient Shaper | **Kick:** Full-band (Punch focus)<br>

<br>**Snare/Hat:** Split-band (Focus > 2kHz to avoid spitty low-mids) |
| **3. Color** | Pre/De-Emphasis Saturation | **Algo:** Tilt EQ (+3dB highs) -> Tanh/Wavefold Saturation -> Untilt EQ.<br>

<br>*Prevents aliasing and preserves air.* |
| **4. Style** | Macro Bias | Global "Style" knob biases this stage (Clean / Gritty / Aggro). |
| **5. Safety** | Soft Clipper | Ceiling: -0.8 dBFS. Soft Knee. |

---

### 5.1 Kick Engine: "Modern Punch & Knock"

**Architecture:** Hybrid (Sub + Knock + Click).
**Sonic Goal:** Independent control of "Chest Hit" (Sub) and "Speaker Knock" (Mid-Low).

**Synthesis Graph:**

1. **Layer A (Sub):** Sine/Triangle Morph Oscillator. Exponential pitch envelope.
2. **Layer B (Knock):** Damped Sine or Resonant Bandpass (100Hz - 250Hz). Adds "wood/box" tone.
3. **Layer C (Click):** 5ms Filtered Noise + High-Freq Impulse.

**Parameter Mapping Table:**

| Macro Control | Internal DSP Parameters | Range / Logic |
| --- | --- | --- |
| **`Drop`** | Pitch Env Depth | 24st - 60st (Deep dive vs Tight drop) |
| **`Knock`** | Layer B Gain, Layer B Freq | Gain: -inf to -3dB<br>

<br>Freq: 110Hz - 240Hz |
| **`Punch`** | Transient Gain, Drive | Attack Boost: 0-6dB<br>

<br>Saturation: 10-40% |
| **`Weight`** | Sub Sustain, Sub Decay | Sustain: -6dB to 0dB<br>

<br>Decay: 200ms - 500ms |

---

### 5.2 Snare Engine: "Acoustic-Hybrid Physics"

**Architecture:** Modal Synthesis (Shell) + Dynamic Noise (Wires).
**Sonic Goal:** A snare that sounds "constructed," not just white noise on a triangle wave.

**Synthesis Graph:**

1. **Layer A (Modal Shell):** Bank of 4-6 Damped Resonators.
* *Mode 0:* Fundamental (180-250Hz).
* *Modes 1-4:* Inharmonic partials (metallic ring).
* *Logic:* Slight randomization of partial ratios per seed to create "unique drums."


2. **Layer B (Snap):** Short Impulse + 2ms high-passed noise burst (The "Stick hit").
3. **Layer C (Wires):** Noise -> **Dynamic Bandpass Filter** (Freq sweeps down over 50ms) -> Envelope.

**Parameter Mapping Table:**

| Macro Control | Internal DSP Parameters | Range / Logic |
| --- | --- | --- |
| **`Tone`** | Mode 0 Freq, Modal Damping | Freq: 180Hz - 300Hz<br>

<br>Damping: Tight vs Ringing |
| **`Wire`** | Noise Level, Env Decay | Balance between "Shell" and "Rattle" |
| **`Crack`** | Layer B Gain, Trans Shaper | The immediate < 10ms impact |
| **`Body`** | Modal Gain | Thickness of the drum (200Hz-500Hz) |

---

### 5.3 Hi-Hat Engine: "Metallic Sheen"

**Architecture:** Resonator Bank + FM + Shaped Noise.
**Sonic Goal:** Crispness without harsh digital aliasing.

**Synthesis Graph:**

1. **Layer A (Metal):** 6-Oscillator Bank (Square/Pulse) + Ring Mod + **Resonator Bank** (3 fixed peaks 6k-12k).
2. **Layer B (Air):** High-pass filtered pink noise (> 6kHz).
3. **Logic:** "Choke" simulation (Closed Hat kills Open Hat tail in playback).

**Parameter Mapping Table:**

| Macro Control | Internal DSP Parameters | Range / Logic |
| --- | --- | --- |
| **`Tightness`** | Decay Time | 30ms (Closed) - 600ms (Open) |
| **`Sheen`** | Resonator Q / Gain | Focuses the metallic "ping" frequencies |
| **`Dirt`** | Wavefold / Saturation | **NOT** Bitcrush (too harsh). Subtle harmonics. |
| **`Color`** | FM Ratios | Dark/Industrial vs Bright/Cymbal-like |

---

## 6. Data & Model Lifecycle

### 6.1 Data Storage

* **Format:** JSONL (`data/user_labels_kick.jsonl`).
* **Schema v1:**
```json
{
  "id": "uuid",
  "timestamp": "iso8601",
  "instrument": "kick",
  "params": { ... },
  "features": { "centroid": 1200, ... },
  "label": 1, // 0 or 1
  "schema_version": 1
}

```



### 6.2 Training Schedule

1. **Cold Start:** Sampler uses random uniform exploration until 10 labels collected per instrument.
2. **Online Update:** Retrain lightweight model (Logistic Regression / MLP) every 20 new labels.
3. **Exploration Decay:** Start `epsilon=0.35`, decay to `0.15` after 100 labels.

### 6.3 Sampling Logic (Sampler)

* **Mutation:** Lock discrete choices (Synthesis Mode). Apply Gaussian Jitter to continuous params: .
* **Constraint:** Ensure diversity. If `dist(new, top_N) < threshold`, reject and resample.

---

## 7. UI/UX Specification

### 7.1 Global Controls

* **Style Macro:** Bias knob affecting generation priors and Post-Chain.
* *Clean:* Transparent saturation, flat EQ.
* *Gritty:* Tape saturation, mid-boost.
* *Aggro:* Hard clipping, pushed transients.
* *Airy:* High-shelf boost, reduced body.



### 7.2 Screens & Flow

**A) Audition Screen (The Core Loop)**

* **Visual:** Large Instrument Card + Waveform + Spectrum.
* **Controls:**
* `Space`: Replay
* `← / →`: History / Next (Generate)
* `↑ / ↓`: Like / Dislike (Keyboard hints visible)
* `M`: **Mutate** (Generate 5 variations of current sound)
* `K`: Add to current Kit
* `1/2/3`: Switch Instrument


* **Macros:** Display 5 primary macros (Instrument-specific + Global Style/Brightness).

**B) Kit Builder (The "Curator")**

* **Layout:** Three columns (Kick, Snare, Hat).
* **Action:** Drag "Liked" sounds from sidebar into slots.
* **Auto-Fill:** Button to "Complete Kit" (uses ML to find a snare that spectrally complements the kick).
* **Export:**
* Generates folder: `My_Kit_01/`
* Files: `Kick_01.wav`, `Snare_01.wav`...
* Metadata: `kit_info.json` (Seeds, Params, ML Score).



**C) Training Progress (The Portfolio View)**

* **Visuals:**
* *Convergence Graph:* Like rate over time.
* *Feature Importance:* Bar chart showing what the user cares about (e.g., "User prefers short decays and high distortion").



---

## 8. Development Plan (Milestones)

* **M0: Foundation:** Repo setup, Typed interfaces, CLI entrypoint, Reproducibility hashing.
* **M1: Core DSP:** DSP primitives (Oscillators, Envelopes, Filters) + Unit Tests.
* **M2: Kick Engine:** Kick Graph (Sub+Knock+Click) + Post-Chain implementation.
* **M3: Snare Engine:** Modal Bank + Dynamic Wire implementation.
* **M4: Hat Engine:** Resonator Bank + Choke logic.
* **M5: Production Chain:** Oversampling, Transient Shaper, Saturation. Integration tests for "Audio Quality" criteria.
* **M6: UI & Workflow:** Audition Screen, Audio Backend, History Caching.
* **M7: ML Layer:** Feature Extractor, Preference Model, Active Sampler, Mutate logic.
* **M8: Kit Builder:** Export logic, Metadata generation, "Auto-fill" logic.
* **M9: Polish & Portfolio:** Visualization graphs, 3 Golden Kits (Demo), README docs.

---

## 9. Testing & QA Strategy

### 9.1 Unit Tests

* **Determinism:** Assert `render(seed=X)` produces identical hash `sha256(buffer)`.
* **Safety:** Assert `max(abs(buffer)) <= 0.92` (-0.8dB).
* **Sanity:** Assert no `NaN` or `Inf`.
* **Cleanliness:** Assert DC offset < 1e-4.

### 9.2 Golden Tests

* Store 5 "Golden Presets" per instrument.
* Run regression test: Render presets -> Extract Features.
* Assert feature values are within 5% tolerance of baseline.

### 9.3 Integration Tests

* Simulate User Session: Generate -> Rate -> Retrain -> Predict. Assert model `predict_proba` changes after training.
* Export Roundtrip: Export kit -> Read JSON metadata -> Re-render from metadata -> Assert audio matches export.

---

## 10. Definition of Done (v1)

1. [ ] All Milestones M0-M9 complete.
2. [ ] Automated Test Suite (Unit + Golden) passes.
3. [ ] Latency targets met on target machine.
4. [ ] 3 Demo Kits exported, verified for audio quality (no clicks, good balance).
5. [ ] Progress Screen successfully visualizes model learning curve.
6. [ ] Project README includes setup, architecture diagram, and "How it Works" section.