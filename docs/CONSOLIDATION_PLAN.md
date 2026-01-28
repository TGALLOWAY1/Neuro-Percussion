# Render Entrypoint Consolidation Plan

## Inventory

### A) Canonical (Keep)
- ✅ `tools/render.py` - Main canonical renderer
- ✅ `tools/render_core.py` - Core rendering utilities

### B) Legacy Render Scripts (Migrate/Delete)

| Script | Functionality | Canonical Equivalent | Action |
|--------|--------------|---------------------|--------|
| `tools/render_kick_spec_presets.py` | Renders kick spec presets | `tools/render.py spec-recipes kick` | ✅ DELETE |
| `tools/render_snare_spec_presets.py` | Renders snare spec presets | `tools/render.py spec-recipes snare` | ✅ DELETE |
| `tools/render_hat_spec_presets.py` | Renders hat spec presets | `tools/render.py spec-recipes hat` | ✅ DELETE |
| `tools/render_macro_presets.py` | Renders macro presets from `presets/macro_presets.json` | ❌ NOT COVERED | ➕ ADD `macro-presets` subcommand |
| `tools/render_control_proof.py` | Renders control proof (ADSR + fader variants) | `tools/render.py control-proof` | ✅ DELETE |
| `tools/render_listen_pack.py` | Renders listening pack (baseline + layer-muted + ADSR variants) | ❌ NOT COVERED | ➕ ADD `listen-pack` subcommand |
| `tools/render_mixready_pack.py` | Renders mix-ready pack with QC | `tools/render.py preset-pack` | ✅ DELETE |

### C) Test Scripts (Replace)

| Script | Functionality | Replacement |
|--------|--------------|-------------|
| `tests/verify_kick.py` | Simple kick verification (NaN/Inf/silence checks) | `tests/test_render_invariants.py` |
| `tests/verify_snare.py` | Simple snare verification (NaN/Inf/silence checks) | `tests/test_render_invariants.py` |

## References Found

### Documentation References
- `docs/RENDER_PIPELINE.md`: Lists legacy scripts (lines 44-56)
- `docs/RENDER_AUDIT_REPORT.md`: Lists legacy scripts (lines 40-50)
- `REPO_AUDIT.md`: Mentions `verify_kick.py` and `verify_snare.py`

### Code References
- No imports of legacy scripts found (they're standalone entrypoints)
- No CI/CD references found

## Implementation Plan

### Step 1: Add Missing Subcommands to `tools/render.py`

#### Add `macro-presets` subcommand
- Loads `presets/macro_presets.json`
- Renders all macro presets for kick/snare/hat
- Prints resolved params to show macro mapping
- Uses `render_one_shot()` with debug support

#### Add `listen-pack` subcommand
- Renders baseline + layer-muted + ADSR variants
- For each instrument: baseline, one layer muted (-60dB), short ADSR, long ADSR
- Uses `render_one_shot()` with debug support

### Step 2: Delete Legacy Scripts

Delete these files (functionality covered):
- `tools/render_kick_spec_presets.py`
- `tools/render_snare_spec_presets.py`
- `tools/render_hat_spec_presets.py`
- `tools/render_control_proof.py`
- `tools/render_mixready_pack.py`

### Step 3: Create `tests/test_render_invariants.py`

Replace `tests/verify_kick.py` and `tests/verify_snare.py` with proper pytest tests:

**Test Cases:**
1. **Param Sweep Invariants** (from `tools/render.py param-sweep`):
   - `test_kick_click_gain_db_changes_output()`
   - `test_snare_wires_gain_db_changes_output()`
   - `test_hat_air_gain_db_changes_output()`

2. **Safety Invariants**:
   - `test_peak_within_ceiling()` - peak <= 0.92
   - `test_fades_applied()` - first/last 64 samples near 0
   - `test_deterministic_with_fixed_seed()` - same seed + params = same hash

3. **Basic Validation**:
   - `test_no_nan_inf()` - no NaN/Inf in output
   - `test_not_silent()` - output has energy

**Implementation Notes:**
- Use `tools.render_core.render_one_shot()` directly (not subprocess)
- Use `copy.deepcopy()` when modifying nested params
- Use pytest fixtures for common setup

### Step 4: Update Documentation

Update `docs/RENDER_PIPELINE.md`:
- Remove "Legacy Render Scripts" section
- Add `macro-presets` and `listen-pack` to subcommands list
- Update examples to show all available subcommands

Update `docs/RENDER_AUDIT_REPORT.md`:
- Mark legacy scripts as deleted
- Update recommendations

### Step 5: Remove Dead Code

After deletion, check for unused functions:
- Helper functions in deleted scripts (if any were imported elsewhere)
- No engine core functions should be removed

## Verification Checklist

- [ ] `python tools/render.py macro-presets --debug` works
- [ ] `python tools/render.py listen-pack --debug` works
- [ ] `python tools/render.py spec-recipes kick --debug` still works
- [ ] `python tools/render.py control-proof --debug` still works
- [ ] `python tools/render.py preset-pack --debug` still works
- [ ] `python tools/render.py param-sweep --debug` still works
- [ ] `pytest tests/test_render_invariants.py -v` passes
- [ ] Legacy scripts deleted
- [ ] Docs updated
- [ ] No broken references
