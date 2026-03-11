# Neuro-Percussion — Deep Refactor Review

**Date**: 2026-03-11
**Scope**: Full codebase — Python engine, React frontend, tooling, docs, and project structure

---

## 1. Architecture Assessment

### Current Architecture

Neuro-Percussion is a **client-server percussion synthesizer** with:

- **Frontend** (Next.js 16 + React 19): Zustand-based state management, Canvas2D Bezier envelope editor, Web Audio preview engine, and a 4-panel layout UI
- **Backend** (Python FastAPI): PyTorch-based DSP engine rendering kick/snare/hat drums, with an sklearn ML preference model for AI-assisted sound exploration
- **Tooling**: CLI render tool (`tools/render.py`) for offline rendering, QC, and preset baking
- **Presets**: JSON-based macro and spec presets

### Architectural Strengths

The architecture has solid fundamentals:

1. **Parameter contract system** — Clear `StoredPatch → CanonicalPatch → EngineParams` pipeline with migration, validation, and dev-mode coverage audits. This is professional-grade.
2. **Spec-driven UI** — All controls rendered from `ParamSpec`/`EnvelopeSpec`. Adding a parameter is a one-line change.
3. **Layered DSP** — Per-instrument `LayerMixer` with gain/mute, consistent ADSR envelopes, and deterministic `PostChain` safety processing.
4. **Hybrid audio** — Client-side Web Audio preview for instant feedback, server-side PyTorch for high-fidelity renders.

### Architectural Problems

**Problem 1 — Duplicated spec-param resolution across instruments**

Each instrument file (`kick.py`, `snare.py`, `hat.py`) contains a 150+ line `resolve_*_spec_params()` function with near-identical patterns: precedence logic, fallback chains, and conditional param mapping. This is the single largest source of code duplication in the engine.

**Why it matters**: Bug fixes and new param patterns must be replicated 3 times. Divergence is inevitable.

**Recommended improvement**: Extract a shared `resolve_spec_params(spec_config, raw_params)` utility that takes a declarative mapping config per instrument rather than imperative if/else chains.

---

**Problem 2 — `tools/render.py` is a 987-line monolith**

This single file contains 7 subcommands, each with its own arg parsing, rendering logic, fingerprinting, and output formatting. It duplicates logic from `render_core.py` in places and has grown organically.

**Why it matters**: Adding a new render subcommand means wading through ~1000 lines. The file mixes orchestration, I/O, and presentation.

**Recommended improvement**: Split into `tools/render/` package with one module per subcommand and shared utilities in `tools/render/common.py`.

---

**Problem 3 — Frontend store is a single 597-line file**

`usePercussionStore.ts` contains state shape, all actions (generation, mutation, feedback, kit management, bezier sync, export), and internal helpers. It's the entire application brain in one file.

**Why it matters**: Every feature change touches this file. There's no separation between audio concerns, UI concerns, and ML concerns.

**Recommended improvement**: Split into slices using Zustand's `StateCreator` pattern:
- `audioSlice.ts` — generation, playback, export
- `mutationSlice.ts` — dice, mutate, AI suggest, feedback
- `envelopeSlice.ts` — bezier sync, envelope params
- `kitSlice.ts` — kit management

---

**Problem 4 — No shared types between frontend and backend**

The frontend defines `CanonicalPatch`, `EngineParams`, and param specs in TypeScript. The backend defines `ENGINE_DEFAULTS`, `PARAM_SCHEMA`, and `PARAM_SPACES` in Python. These must stay synchronized manually.

**Why it matters**: A param rename in the backend can silently break the frontend mapping. There's no compile-time or CI check for contract drift.

**Recommended improvement**: Generate a shared `param_schema.json` from the Python `PARAM_SCHEMA` at build time. The frontend can validate against it in tests. A lightweight CI step (`pytest tests/test_schema_sync.py`) can catch drift.

---

**Problem 5 — Documentation is scattered and partially obsolete**

There are 13 markdown files across 3 locations (`/docs/`, `/docs/dev/`, root), plus `ARCHITECTURE_AUDIT.md` which describes a *previous* architecture (references deleted components like `AuditionView`, `WaveformViewer`, `EnvelopeGraph.tsx`). Multiple docs describe the same systems from different angles (PARAMS.md, PARAMETER_CONTRACT.md, RESEARCH_GUIDANCE.md).

**Why it matters**: A new contributor cannot tell which doc is current. The ARCHITECTURE_AUDIT.md actively misleads about the current state.

---

## 2. File System Refactor

### Current Problems

1. **`renders/` directory (14MB)** — WAV files and resolved JSON from development iterations. These are build artifacts, not source code. They should not be in the repository.

2. **`docs/` is flat + scattered** — 10 markdown files at the top level of `docs/`, plus a `dev/` subfolder with 4 more, plus root `ARCHITECTURE_AUDIT.md` and `README.md`. No clear hierarchy.

3. **`presets/Snare_Default_OneShot.json`** — Legacy preset format (noted in CONSOLIDATION_PLAN as deprecated). Sits alongside current-format presets.

4. **`frontend/public/` contains Next.js boilerplate** — `next.svg`, `vercel.svg`, `globe.svg`, `file.svg`, `window.svg` are unused Next.js starter assets.

5. **`engine/core/` has only 3 files** — `io.py`, `types.py`, `params.py`. The `params.py` file's role overlaps with `engine/params/` module. Unclear boundary.

6. **`engine/qc/` is minimal** — `qc.py` and `thresholds.py` exist but are thinly used. Could be folded into `tools/` or `engine/dsp/`.

### Recommended Directory Structure

```
Neuro-Percussion/
├── README.md                          # Single entry point for all documentation
├── start.sh
├── .gitignore
│
├── engine/                            # Python DSP backend
│   ├── main.py                        # FastAPI app
│   ├── __init__.py
│   ├── core/                          # Shared types and I/O
│   │   ├── io.py
│   │   └── types.py
│   ├── dsp/                           # DSP primitives (unchanged — well organized)
│   │   ├── envelopes.py
│   │   ├── filters.py
│   │   ├── oscillators.py
│   │   ├── noise.py
│   │   ├── mixer.py
│   │   ├── postchain.py
│   │   ├── oversample.py
│   │   └── delay.py
│   ├── instruments/                   # Per-instrument engines (unchanged)
│   │   ├── kick.py
│   │   ├── snare.py
│   │   └── hat.py
│   ├── params/                        # Parameter system
│   │   ├── schema.py
│   │   ├── canonical_defaults.py
│   │   ├── macros.py
│   │   ├── resolve.py
│   │   ├── clamp.py
│   │   └── engine_params.py
│   ├── ml/                            # ML preference model (unchanged)
│   │   ├── model.py
│   │   ├── dataset.py
│   │   ├── sampler.py
│   │   └── features.py
│   ├── export/
│   │   └── exporter.py
│   └── qc/                            # Keep if QC grows; merge into tools/ if not
│       ├── qc.py
│       └── thresholds.py
│
├── frontend/                          # React frontend (unchanged internal structure)
│   ├── src/
│   │   ├── app/
│   │   ├── audio/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── store/
│   │   └── types/
│   └── ...
│
├── tools/                             # CLI tooling
│   ├── render.py                      # (or split into render/ package)
│   └── render_core.py
│
├── tests/                             # Python tests (unchanged)
│
├── presets/                           # Preset JSON files
│
└── docs/                              # Consolidated documentation
    ├── architecture.md                # System architecture overview
    ├── parameters.md                  # Unified parameter documentation
    ├── development.md                 # Dev setup, testing, contributing
    ├── dsp-reference.md               # DSP engine internals
    ├── render-pipeline.md             # Render tooling docs
    └── research/                      # Research materials
        └── notebooklm_param_spec.json
```

### Why This Is Better

- **`renders/` removed from repo** — Add to `.gitignore`, delete from tracking. 14MB of WAV artifacts don't belong in source control.
- **Flat docs structure** — 5-6 files with clear names vs. 15+ scattered files.
- **`engine/core/params.py` merged** — Eliminates confusion between `engine/core/params.py` and `engine/params/`.
- **Root-level noise removed** — `ARCHITECTURE_AUDIT.md` content absorbed into `docs/architecture.md`.

---

## 3. Dead Code Report

### Confirmed Dead Code

| File/Code | Evidence | Action |
|-----------|----------|--------|
| `frontend/public/next.svg`, `vercel.svg`, `globe.svg`, `file.svg`, `window.svg` | Next.js starter boilerplate. Not referenced in any component. | **Delete** |
| `presets/Snare_Default_OneShot.json` | Legacy format. CONSOLIDATION_PLAN marks it deprecated. Current presets use `snare_spec_presets.json`. | **Delete** |
| `ARCHITECTURE_AUDIT.md` (root) | References deleted components (`AuditionView`, `WaveformViewer`, `EnvelopeGraph.tsx`). Describes a prior architecture. | **Delete** (merge relevant content into `docs/architecture.md`) |
| `docs/CONSOLIDATION_PLAN.md` | Completed plan. All steps marked done in CONSOLIDATION_REPORT. | **Delete** |
| `docs/CONSOLIDATION_REPORT.md` | Historical record of a completed migration. No ongoing value. | **Delete** (or archive in git history) |
| `docs/AUDIT_REPORT.md` | One-time audit output. Superseded by ongoing development. | **Delete** |
| `docs/RENDER_AUDIT_REPORT.md` | Consolidation-era audit. Superseded by CONSOLIDATION_REPORT. | **Delete** |
| `docs/REPO_AUDIT.md` | One-time audit. References deleted scripts (`verify_kick.py`, `verify_snare.py`). | **Delete** |
| `renders/` (entire directory) | Build artifacts. 14MB of WAVs and resolved JSONs from development. | **Delete from tracking, add to `.gitignore`** |
| `tests/debug_snare.py` | One-off debug script, not a test. No assertions. | **Delete** |
| `engine/dsp/filters.py` — `Effects.transient_shaper()` | Marked "hard to vectorize", incomplete implementation. Referenced by `punch` macro but produces minimal effect. | **Potential dead code — requires confirmation** |
| `engine/ml/features.py` — `FeatureExtractor.compute()` | Computes RMS, crest factor, spectral features. Never wired into model training. | **Dead code — delete or wire in** |
| `hat.py` — `hat.dirt.legacy_bitcrush` path | Fallback to sample-rate reduction if flag is True. Default is False. Wavefold is the active path. | **Dead code — delete** |
| All instrument `.py` — `legacy_normalize` flag | Present in all 3 instruments. Default False. Can cancel fader changes. No UI control. | **Dead code — delete** |
| `frontend/src/audio/params/researchGuidanceLoader.ts` | Parses RESEARCH_GUIDANCE.md into structured data. No imports found in application code. Only used in one test. | **Potential dead code — confirm if CI validation planned** |
| `frontend/src/audio/params/validateResearchGuidance.ts` | Validation logic for research guidance. Similar to above. | **Potential dead code — confirm** |
| `frontend/src/audio/params/validateParamSpecAgainstImplementation.ts` | Validation utility. Check if used in tests only. | **Potential dead code — confirm** |
| Experimental params (`curve`, `pitch_curve`, `noise_color`, `air_pct`, `noise_band_q`) | Marked `experimental: true` in specs. Some not mapped in backend. | **Potential dead code — confirm mapping status** |

### Summary

- **8 files** confirmed deletable (docs, presets, debug scripts, boilerplate)
- **1 directory** (`renders/`) should be removed from tracking
- **4 code paths** in Python engine are dead or near-dead
- **3-4 frontend files** are potentially dead (validation/research guidance utilities)
- **5-6 experimental params** may have no backend mapping

---

## 4. Code Quality Issues

### Issue 1 — Duplicated Spec Resolution (HIGH)

**Problem**: `resolve_kick_spec_params()` (158 lines), `resolve_snare_spec_params()` (162 lines), and `resolve_hat_spec_params()` (154 lines) follow the same pattern: check for `{inst}.spec.*` keys → map to advanced params → apply precedence rules.

**Why problematic**: Three copies of similar logic. When a pattern changes (e.g., new precedence rule), all three must be updated. They've already diverged slightly in style.

**Recommended improvement**:

```python
# engine/params/spec_resolver.py

KICK_SPEC_MAP = {
    "kick.spec.pitch_hz": {"target": "kick.sub.pitch_hz", "transform": None},
    "kick.spec.click_level": {"target": "kick.click.gain_db", "transform": pct_to_db},
    # ...
}

def resolve_spec_params(raw_params: dict, spec_map: dict) -> dict:
    """Declarative spec → advanced param resolution."""
    result = {}
    for spec_key, mapping in spec_map.items():
        if spec_key in raw_params:
            value = raw_params[spec_key]
            if mapping["transform"]:
                value = mapping["transform"](value)
            result[mapping["target"]] = value
    return result
```

---

### Issue 2 — RegenPanel is a feature-dense component (MEDIUM)

**Problem**: `RegenPanel.tsx` (270 lines) contains: Roll Dice, Smart Mutate, mutation focus/amount controls, replay, AI Suggest, feedback buttons, Save WAV, Drag WAV handle, Add to Kit, Export Kit, macro sliders grid, and kit status bar. That's ~12 distinct UI concerns.

**Why problematic**: Any change to one feature (e.g., feedback UI) requires reading through all the others. Difficult to test individual pieces.

**Recommended improvement**: Extract into focused sub-components:

```
panels/RegenPanel.tsx           → orchestrator (layout only)
panels/regen/GenerationControls.tsx  → dice, mutate, replay
panels/regen/MutationConfig.tsx      → focus dropdown, amount slider
panels/regen/FeedbackControls.tsx    → AI suggest, thumbs up/down
panels/regen/ExportControls.tsx      → save WAV, drag handle, kit
panels/regen/MacroGrid.tsx           → macro sliders
```

---

### Issue 3 — Inconsistent error handling in API layer (MEDIUM)

**Problem**: `frontend/src/lib/api.ts` does `console.error()` and stores errors in Zustand state, but there's no retry logic, no structured error types, and no distinction between network errors, validation errors, and server errors.

**Why problematic**: Users see a generic toast for any failure. The frontend can't intelligently retry or offer recovery options.

**Recommended improvement**: Define error types (`NetworkError`, `ValidationError`, `ServerError`), add a simple retry wrapper for network failures, and surface actionable messages.

---

### Issue 4 — Magic numbers in DSP code (LOW-MEDIUM)

**Problem**: Instrument files contain hardcoded numbers throughout:
- `kick.py`: `carrier_freq = 55.0`, click filter `6000`, knock decay `0.0005`
- `snare.py`: FDN `delays = [0.0029, 0.0037, 0.0043, 0.0053]`, sweep `9000 → 3500` Hz
- `hat.py`: Metal harmonics `[1.0, 1.47, 1.78, 2.12, 2.67, 3.14]`, HP filter `300`

**Why problematic**: These values are physically meaningful (e.g., FDN delays are based on drum shell dimensions) but undocumented. A future developer might change them without understanding the acoustic rationale.

**Recommended improvement**: Extract to named constants at the top of each file with brief comments:

```python
# Based on 14" snare shell modal frequencies
FDN_DELAY_TIMES = [0.0029, 0.0037, 0.0043, 0.0053]

# Bell-like harmonic series for metallic character
HAT_HARMONICS = [1.0, 1.47, 1.78, 2.12, 2.67, 3.14]
```

---

### Issue 5 — `_getEngineParams()` builds payload inline (LOW)

**Problem**: In `usePercussionStore.ts`, the `_getEngineParams()` helper manually constructs the engine payload by merging macro defaults, envelope defaults, current params, and overrides. It's a 20+ line inline function with nested spread operators.

**Why problematic**: The payload construction logic is in the store rather than in the contract layer where it belongs. It duplicates responsibility with `mapCanonicalToEngineParams()`.

**Recommended improvement**: Move to `audio/contract/` and have the store call it as a pure function.

---

## 5. Readability Improvements

### Naming

| Current | Proposed | Reason |
|---------|----------|--------|
| `_getParamIdsForEnvelope()` | `getEnvelopeParamIds()` | Remove leading underscore (not truly private in JS), clearer name |
| `rollDice()` | `randomizeAll()` | Domain-neutral, self-documenting |
| `smartMutate()` | `mutateParams()` | "Smart" is subjective. The mutation config determines behavior. |
| `feedbackSent` (store field) | `lastFeedbackLabel` | Clarifies it's the label value, not a boolean |
| `timingMs` (store field) | `masterDurationMs` | Matches UI label ("TIMING" → "master duration") |
| `mutationFocus` | `mutationTarget` | "Focus" is vague; "target" is what it is |
| `to_engine_params()` (Python) | `strip_legacy_params()` | Does exactly one thing — strip legacy keys |
| `render_one_shot()` (tools) | Name is fine | — |

### Function Length

| File | Lines | Recommendation |
|------|-------|---------------|
| `tools/render.py` | 987 | Split into package with one module per subcommand |
| `BezierEnvelopeCanvas.tsx` | 608 | Extract canvas rendering to `useBezierCanvas` hook, keep component for React lifecycle |
| `usePercussionStore.ts` | 597 | Split into Zustand slices |
| `snare.py` | 533 | Keep (DSP is inherently long), but extract constants |
| `kick.py` | 465 | Keep, but extract `resolve_kick_spec_params()` to shared resolver |
| `macros.py` | 339 | Acceptable, but add section headers |

### Consistency

1. **Python imports**: Some files use `from engine.dsp.filters import Filter`, others use `from engine.dsp import filters`. Standardize on one.
2. **Frontend file naming**: Most use camelCase (`usePercussionStore.ts`) but specs use snake_case (`spec_kick.ts`). The specs match their Python counterparts, which is intentional but could use a comment.
3. **Test naming**: Python tests use `test_*.py` (correct). Frontend tests use `__tests__/*.test.ts` (correct). Both are consistent within their domains.

---

## 6. Documentation Reorganization

### Current State

| File | Lines | Status |
|------|-------|--------|
| `README.md` | 156 | **Current** — Good overview but mixes architecture + progress + usage |
| `ARCHITECTURE_AUDIT.md` | 122 | **Obsolete** — References deleted components |
| `docs/PRD.md` | ~400 | **Historical** — Product requirements doc |
| `docs/PROJECT_SPEC.md` | ~600 | **Historical** — Detailed project specification |
| `docs/PARAMS.md` | ~300 | **Current** — Parameter documentation |
| `docs/RESEARCH_GUIDANCE.md` | ~350 | **Current** — DSP research notes and gating rules |
| `docs/RENDER_PIPELINE.md` | ~200 | **Current** — Render tool documentation |
| `docs/CONSOLIDATION_PLAN.md` | 116 | **Obsolete** — Completed plan |
| `docs/CONSOLIDATION_REPORT.md` | 136 | **Obsolete** — Completed migration report |
| `docs/AUDIT_REPORT.md` | ~200 | **Obsolete** — One-time audit |
| `docs/RENDER_AUDIT_REPORT.md` | ~100 | **Obsolete** — Consolidation-era artifact |
| `docs/REPO_AUDIT.md` | ~600 | **Obsolete** — References deleted files |
| `docs/dev/PARAMETER_CONTRACT.md` | ~150 | **Current** — Frontend contract docs |
| `docs/dev/envelopes_inventory.md` | ~100 | **Current** — Envelope reference |
| `docs/dev/snare_param_application_points.md` | ~100 | **Current** — Snare-specific reference |
| `docs/dev/SNARE_ONESHOT_FIX.md` | ~80 | **Obsolete** — Bug fix record |
| `docs/dev/ENVELOPES_IMPLEMENTATION.md` | ~150 | **Current** — Envelope system docs |

### Recommended Structure

```
docs/
├── architecture.md         # System overview, data flow, module responsibilities
├── parameters.md           # Unified: param specs, contract, mapping, ranges
├── development.md          # Setup, testing, contributing, keyboard shortcuts
├── dsp-reference.md        # Engine internals, DSP algorithms, magic number rationale
├── render-pipeline.md      # CLI render tool usage (keep, it's current)
└── research/
    └── notebooklm_param_spec.json
```

### Content Migration Plan

**`docs/architecture.md`** ← Merge from:
- README.md "Architecture" section
- ARCHITECTURE_AUDIT.md "What Stays" section (discard "What Must Change" — it's done)
- PROJECT_SPEC.md architecture sections
- dev/ENVELOPES_IMPLEMENTATION.md

**`docs/parameters.md`** ← Merge from:
- PARAMS.md (full content)
- dev/PARAMETER_CONTRACT.md
- dev/envelopes_inventory.md
- dev/snare_param_application_points.md
- RESEARCH_GUIDANCE.md parameter-related sections

**`docs/development.md`** ← Merge from:
- README.md "Development" section
- Testing instructions from various docs

**`docs/dsp-reference.md`** ← Merge from:
- RESEARCH_GUIDANCE.md DSP sections
- Inline comments from instrument files (formalized)
- dev/SNARE_ONESHOT_FIX.md (as a "known issues resolved" section)

**Delete after migration:**
- `ARCHITECTURE_AUDIT.md` (root)
- `docs/CONSOLIDATION_PLAN.md`
- `docs/CONSOLIDATION_REPORT.md`
- `docs/AUDIT_REPORT.md`
- `docs/RENDER_AUDIT_REPORT.md`
- `docs/REPO_AUDIT.md`
- `docs/PRD.md` (archive in git history)
- `docs/PROJECT_SPEC.md` (archive in git history)
- `docs/dev/SNARE_ONESHOT_FIX.md`
- `docs/dev/` folder (contents merged into parent docs)

**Simplify README.md** to:
- Project description (2-3 sentences)
- Screenshot
- Quick start (3 commands)
- Link to `docs/` for everything else
- License

---

## 7. Step-by-Step Refactor Plan

### Step 1 — Remove dead files and build artifacts

**Changes:**
- Delete `renders/` from tracking, add `renders/` to `.gitignore`
- Delete `presets/Snare_Default_OneShot.json`
- Delete `tests/debug_snare.py`
- Delete `frontend/public/next.svg`, `vercel.svg`, `globe.svg`, `file.svg`, `window.svg`
- Delete obsolete docs: `ARCHITECTURE_AUDIT.md`, `docs/CONSOLIDATION_PLAN.md`, `docs/CONSOLIDATION_REPORT.md`, `docs/AUDIT_REPORT.md`, `docs/RENDER_AUDIT_REPORT.md`, `docs/REPO_AUDIT.md`

**Why:** Reduces repository size by ~14MB and removes misleading files. No functional impact.

**Risk:** Low. All deletions are non-functional files.

---

### Step 2 — Remove dead code paths in engine

**Changes:**
- Remove `legacy_normalize` flag and associated code from all 3 instruments
- Remove `hat.dirt.legacy_bitcrush` fallback path from `hat.py`
- Delete `engine/ml/features.py` (or wire `FeatureExtractor` into model training if desired)
- Remove or complete `Effects.transient_shaper()` in `filters.py`

**Why:** Dead code creates confusion and maintenance burden. These paths are never activated.

**Risk:** Low. All paths are gated by flags that default to `False` or are never called.

---

### Step 3 — Extract shared spec resolver

**Changes:**
- Create `engine/params/spec_resolver.py` with declarative spec→param mapping
- Define per-instrument mapping configs (replacing 150+ line imperative functions)
- Update `kick.py`, `snare.py`, `hat.py` to use the shared resolver
- Add tests for the new resolver

**Why:** Eliminates the largest source of code duplication in the engine. Makes adding instruments easier.

**Risk:** Medium. The spec resolution has subtle precedence rules that must be preserved. Requires thorough testing against existing behavior.

---

### Step 4 — Split the Zustand store into slices

**Changes:**
- Create `frontend/src/store/slices/` with `audioSlice.ts`, `mutationSlice.ts`, `envelopeSlice.ts`, `kitSlice.ts`
- Keep `usePercussionStore.ts` as the composition root
- Move internal helpers out of the store file

**Why:** The 597-line store is the hardest file to navigate in the frontend. Slices make each concern independently testable.

**Risk:** Medium. State interactions between slices need careful handling. Existing tests must keep passing.

---

### Step 5 — Split RegenPanel and render.py

**Changes:**
- Extract RegenPanel sub-components: `GenerationControls`, `MutationConfig`, `FeedbackControls`, `ExportControls`, `MacroGrid`
- Split `tools/render.py` into `tools/render/` package with per-subcommand modules

**Why:** Both are the largest files in their domain and mix multiple concerns.

**Risk:** Low. Pure structural refactor with no logic changes.

---

### Step 6 — Extract constants and improve naming

**Changes:**
- Extract magic numbers in instrument files to named constants with comments
- Rename ambiguous functions (see table in Section 5)
- Standardize Python import style

**Why:** Improves readability for new contributors and preserves acoustic design intent.

**Risk:** Low. Renaming can be done with find-and-replace. Constants extraction is mechanical.

---

### Step 7 — Consolidate documentation

**Changes:**
- Create unified docs: `architecture.md`, `parameters.md`, `development.md`, `dsp-reference.md`
- Simplify `README.md` to a quick-start guide
- Delete obsolete/migrated docs
- Delete `docs/dev/` folder

**Why:** Reduces 15+ doc files to 5-6 focused ones. Eliminates contradictory information.

**Risk:** Low. Documentation changes don't affect functionality. Content is preserved in git history.

---

### Step 8 — Add contract sync check

**Changes:**
- Generate `param_schema.json` from Python `PARAM_SCHEMA` as a build step
- Add `tests/test_schema_sync.py` that validates frontend specs against the generated schema
- Add to CI if available

**Why:** Prevents silent contract drift between frontend and backend parameter definitions.

**Risk:** Low. Additive change that catches bugs without altering behavior.

---

## 8. Optional Improvements

### 8.1 — Cleaner experimental param handling

Currently, `experimental: true` params exist in frontend specs but some have no backend mapping. Options:
1. **Remove unmapped experimental params** — Simplest. Delete `curve`, `pitch_curve`, `noise_color`, `air_pct`, `noise_band_q` from specs until backend supports them.
2. **Add backend mapping** — If the DSP supports these params, wire them in.
3. **Gate in UI** — Show experimental params only in a dev mode.

**Recommendation:** Option 1 unless there's active development on these params.

### 8.2 — Complete the click layer system

The frontend has click layer UI (CLICK 1-3 with sample selectors) stored in local component state. Either:
1. **Remove the UI** until sample functionality is built
2. **Wire it into Zustand** and connect to a backend sample layer

Incomplete features visible to users erode trust. Option 1 is safer.

### 8.3 — Type the Python engine params

The engine uses `dict` for all params. This is fragile:

```python
# Current — no type safety
def render(self, params: dict, seed: int = 0):
    click_gain = params.get("kick.click.gain_db", -6)
```

Consider TypedDict or dataclasses for instrument params, at least at the API boundary. This catches typos at development time rather than at render time.

### 8.4 — Improve `engine/ml/features.py` or remove it

`FeatureExtractor.compute()` calculates useful audio features (RMS, crest factor, spectral centroid, flatness) but they're never fed to the ML model. Either:
1. **Wire features into model training** — Would improve the preference model
2. **Delete** — If the macro-only model is sufficient

### 8.5 — Add a `requirements.txt` or `pyproject.toml`

The README says `pip install -r requirements.txt` but I don't see a `requirements.txt` in the root. The Python dependencies (FastAPI, PyTorch, scikit-learn, numpy, etc.) should be explicitly pinned.

### 8.6 — Merge `engine/core/params.py` into `engine/params/`

The `engine/core/params.py` file creates confusion with the `engine/params/` module. Its functionality should be absorbed into `engine/params/engine_params.py` or similar.

---

## Summary

### By Impact (highest first)

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | Remove `renders/` from tracking | 5 min | Reduces repo by 14MB |
| P0 | Delete obsolete docs (6 files) | 10 min | Removes misleading information |
| P1 | Delete confirmed dead code (files + code paths) | 1 hour | Reduces cognitive load |
| P1 | Extract shared spec resolver | 4-6 hours | Eliminates largest code duplication |
| P1 | Split Zustand store into slices | 3-4 hours | Makes frontend state manageable |
| P2 | Split RegenPanel + render.py | 2-3 hours | Better component architecture |
| P2 | Consolidate documentation | 3-4 hours | Single source of truth |
| P2 | Extract constants, improve naming | 2 hours | Better readability |
| P3 | Add contract sync check | 2 hours | Prevents drift |
| P3 | Clean up experimental params | 1 hour | Reduces confusion |
| P3 | Type Python engine params | 4-6 hours | Long-term safety |

**Total estimated effort**: ~25-35 hours of focused work, deliverable in stages without disrupting functionality.

The codebase has strong foundations — the parameter contract system, spec-driven UI, and layered DSP architecture are genuinely well-designed. The refactor work is about clearing accumulated iteration artifacts and making the existing good architecture shine through.
