# Render Pipeline Documentation

Complete documentation of how renders are produced, where params are resolved, seed handling, and output paths.

## Overview

The render pipeline processes audio through multiple stages:
1. Parameter resolution (defaults + spec/macro mapping + clamps)
2. Audio generation (per-layer synthesis)
3. Layer mixing (gain/mute per layer)
4. Post-processing (DC block, fades, soft clip, clamp)
5. Export (WAV bytes)

## Entry Points

### Canonical Renderer
**File**: `tools/render.py`

The canonical renderer consolidates all render functionality:

```bash
# Render single one-shot
python tools/render.py one-shot kick params.json --debug --qc

# Render mix-ready pack
python tools/render.py preset-pack --debug --qc

# Render spec recipes
python tools/render.py spec-recipes kick --debug

# Render macro-only presets
python tools/render.py macro-presets --debug

# Render listening pack (baseline + layer-muted + ADSR variants)
python tools/render.py listen-pack --debug

# Render control proof
python tools/render.py control-proof --debug

# Run param sweep tests
python tools/render.py param-sweep --debug
```

**Core Module**: `tools/render_core.py`
- `render_one_shot()`: Main rendering function with full param tracing
- `get_unique_output_dir()`: Generates unique timestamped directories
- `_compute_audio_fingerprint()`: SHA256 hash + spectral analysis

### Test Scripts
- `tests/test_render_invariants.py`: Render invariants tests (param sweep, safety, determinism)

## Parameter Resolution Flow

### Step-by-Step Process

1. **Input Params** (`params: dict`)
   - User-provided parameters (may be partial)
   - Can include macro params, spec params, or advanced params

2. **Spec Param Mapping** (if `{instrument}.spec.*` exists)
   - `resolve_kick_spec_params()` / `resolve_snare_spec_params()` / `resolve_hat_spec_params()`
   - Maps human-friendly spec params to internal advanced params
   - **Location**: `engine/instruments/{kick,snare,hat}.py`
   - **Output**: Implied advanced params dict

3. **Deep Merge Spec Implied**
   - Merges spec-implied params into input params
   - User-provided params win (not overwritten)

4. **Realistic Mode Clamps** (if `mode="realistic"`)
   - `clamp_params(instrument, params)`
   - **Location**: `engine/params/clamp.py`
   - Caps extreme values to avoid harsh sounds

5. **Resolve Params** (`resolve_params(instrument, params)`)
   - **Location**: `engine/params/resolve.py`
   - Deep-merge with `DEFAULT_PRESET[instrument]`
   - Apply macro mapping if macros exist (`apply_macros()`)
   - **Location**: `engine/params/macros.py`
   - Safe merge: user advanced params win over macro-implied

6. **Final Resolved Params**
   - Complete parameter set ready for engine

## Audio Generation Flow

### Per-Instrument Engine

Each instrument (`KickEngine`, `SnareEngine`, `HatEngine`) follows this pattern:

1. **Seed Setup**
   - `torch.manual_seed(seed)` at start of `render()`
   - If seed is None, generate random seed

2. **Layer Generation**
   - Generate audio for each layer (sub/click/knock/room, etc.)
   - Apply per-layer ADSR envelopes
   - Apply per-layer processing (filters, saturation, etc.)

3. **Layer Mixing**
   - `LayerMixer.mix(params, instrument, default_specs)`
   - **Location**: `engine/dsp/mixer.py`
   - Extracts `{instrument}.{layer}.gain_db` and `{instrument}.{layer}.mute`
   - Sums all layers with gain/mute applied

4. **Post-Mix Processing**
   - EQ scoop (kick/snare)
   - Compressor (kick/snare)
   - HPF (hat)
   - Global decay (hat, if not using spec)

5. **Downsampling** (if oversampled)
   - Kick: 4x oversample → downsample
   - Snare: 2x oversample → downsample
   - Hat: 4x oversample → downsample

6. **Legacy Normalize** (if `params["legacy_normalize"] == True`)
   - Peak normalize to 0.95
   - **Warning**: This cancels fader changes!

7. **PostChain**
   - `PostChain.process(audio, instrument, sample_rate, params)`
   - **Location**: `engine/dsp/postchain.py`
   - DC block → optional transient shaper → soft clip → fades → safety clamp
   - **Always runs** before return

## Seed Handling

### Current Behavior
- **Fixed seed**: If `seed` parameter provided, uses that value
- **Random seed**: If `seed=None`, generates random seed
- **Determinism**: Same seed + same params = identical output (deterministic)

### Seed Sources
- **Render tools**: Default `seed=42` (fixed for reproducibility)
- **API endpoints**: Extracts `seed` from params dict (default 0)
- **Canonical renderer**: `--seed <int>` flag (default: random)

### Seed Usage
- `torch.manual_seed(seed)` called at start of `engine.render()`
- All random operations (noise, phase offsets, jitter) use this seed
- Ensures determinism for testing and reproducibility

## Output Paths

### Unique Directory Structure
Default: `renders/{category}/YYYYMMDD_HHMMSS_{gitshort}/`

Example: `renders/param_sweep/20260128_175252_b6e096e/`

### Output Files
- `{name}.wav`: Audio file (48kHz, mono)
- `{name}.resolved.json`: Debug info (if `--debug` enabled)
  - Contains: input_params, resolved_params, seed, git_hash, fingerprint, qc_result

### File Naming
- One-shot: `{instrument}_oneshot.wav`
- Presets: `{instrument}_spec_{preset_name}.wav`
- Control proof: `{instrument}_{variant}.wav`

## Debug Outputs

### Resolved JSON (`{name}.resolved.json`)

Contains complete param trace:

```json
{
  "instrument": "kick",
  "script_name": "render.py one-shot",
  "timestamp": "2026-01-28T17:52:52",
  "git_hash": "b6e096e",
  "seed": 42,
  "mode": "default",
  "input_params": {...},
  "params_after_spec": {...},
  "params_after_clamp": null,
  "resolved_params": {...},
  "fingerprint": {
    "sha256": "...",
    "peak": 0.4422,
    "rms": 0.0794,
    "low_energy": ...,
    "mid_energy": ...,
    "high_energy": ...
  },
  "qc_result": {...},
  "wav_path": "..."
}
```

### Fingerprint
- **SHA256**: Hash of audio bytes (detects identical renders)
- **Peak/RMS**: Basic audio metrics
- **Band energies**: Low (20-200Hz), Mid (200-5kHz), High (5k-24kHz)

## Common Issues & Fixes

### Issue: Renders Not Changing

**Symptoms**: Different params produce identical audio (same SHA256 hash)

**Root Causes**:
1. **Shallow copy**: Using `dict.copy()` instead of `copy.deepcopy()` for nested params
2. **Params not applied**: Spec/macro mapping overwrites user params
3. **Legacy normalize**: Peak normalization cancels fader changes
4. **Wrong buffer**: Exporting pre-mix stem instead of post-processed master

**Fix**: Use `copy.deepcopy()` when modifying nested params, ensure user params win in resolution

### Issue: Static Seed

**Symptoms**: All renders identical even with different params

**Root Cause**: Hard-coded seed in render scripts

**Fix**: Use `--seed` flag or random seed by default

### Issue: Output Overwrite

**Symptoms**: New renders overwrite old files

**Root Cause**: Using date-only directory (`YYYYMMDD`)

**Fix**: Use unique timestamped directories (`YYYYMMDD_HHMMSS_{hash}`)

### Issue: Wrong File Written

**Symptoms**: Exported audio doesn't match what engine returns

**Root Cause**: Exporting wrong buffer (pre-mix, pre-postchain)

**Fix**: Ensure export uses final `PostChain.process()` output

## Verification

### Param Sweep Test
Run `python tools/render.py param-sweep --debug` to verify:
- Kick click gain_db = 0 vs -60 produces different hashes
- Snare wires gain_db = 0 vs -60 produces different hashes
- Hat air gain_db = 0 vs -60 produces different hashes

If any test fails, params are not being applied correctly.

### Debug Mode
Always use `--debug` flag when troubleshooting:
- Saves resolved.json with full param trace
- Shows fingerprint (SHA256) for comparison
- Includes git hash for reproducibility

## Code Locations

### Parameter Resolution
- `engine/params/resolve.py`: Main resolution logic
- `engine/params/macros.py`: Macro-to-advanced mapping
- `engine/params/clamp.py`: Realistic mode clamps
- `engine/params/schema.py`: DEFAULT_PRESET and PARAM_SCHEMA

### Spec Mapping
- `engine/instruments/kick.py`: `resolve_kick_spec_params()`
- `engine/instruments/snare.py`: `resolve_snare_spec_params()`
- `engine/instruments/hat.py`: `resolve_hat_spec_params()`

### Audio Processing
- `engine/instruments/{kick,snare,hat}.py`: Engine.render()
- `engine/dsp/mixer.py`: LayerMixer.mix()
- `engine/dsp/postchain.py`: PostChain.process()
- `engine/core/io.py`: AudioIO.to_bytes()

### Rendering Tools
- `tools/render.py`: Canonical renderer (single entrypoint)
- `tools/render_core.py`: Core rendering utilities
