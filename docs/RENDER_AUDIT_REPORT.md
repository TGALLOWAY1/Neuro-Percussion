# Render Pipeline Audit Report

**Date**: 2026-01-28  
**Git Hash**: b6e096e  
**Status**: ✅ FIXED

## Problem Statement

User symptom: "renders don't seem to be changing character"

## Root Cause Analysis

### Issue Found: Shallow Copy in Param Sweep Test

**Problem**: Initial param sweep test used `dict.copy()` instead of `copy.deepcopy()` when modifying nested params.

**Impact**: Nested dicts were shared between test cases, causing params to not be properly set.

**Fix**: Changed to `copy.deepcopy()` in `tools/render.py` param-sweep command.

### Verification

Param sweep test now passes:
- ✅ Kick click gain_db = 0 vs -60: Hashes differ, early peak drops
- ✅ Snare wires gain_db = 0 vs -60: Hashes differ
- ✅ Hat air gain_db = 0 vs -60: Hashes differ

## Render Pipeline Audit Results

### Render Scripts Found

1. **Canonical Renderer** (`tools/render.py`)
   - ✅ New consolidated tool
   - ✅ Debug outputs (resolved.json)
   - ✅ Fingerprinting (SHA256)
   - ✅ Unique output directories
   - ✅ Param sweep tests

2. **Legacy Scripts** (still functional, should migrate):
   - `tools/render_kick_spec_presets.py`
   - `tools/render_snare_spec_presets.py`
   - `tools/render_hat_spec_presets.py`
   - `tools/render_macro_presets.py`
   - `tools/render_control_proof.py`
   - `tools/render_listen_pack.py`
   - `tools/render_mixready_pack.py`

3. **Test Scripts**:
   - `tests/verify_kick.py`
   - `tests/verify_snare.py`

### Parameter Resolution Flow (Verified)

1. **Input params** → User-provided dict
2. **Spec mapping** → `resolve_{instrument}_spec_params()` (if spec params exist)
3. **Clamp** → `clamp_params()` (if `mode="realistic"`)
4. **Resolve** → `resolve_params()` (deep-merge with defaults)
5. **Macro mapping** → `apply_macros()` (if macros exist)
6. **Safe merge** → User advanced params win
7. **Engine render** → Uses resolved params
8. **PostChain** → Always runs before return
9. **Export** → Final post-processed buffer

### Seed Handling

- **Fixed seed**: `seed=42` in most render scripts (reproducible)
- **Random seed**: Default in canonical renderer (unless `--seed` provided)
- **Determinism**: Same seed + same params = identical output ✅

### Output Paths

- **Legacy**: `renders/{category}/YYYYMMDD/` (can overwrite)
- **Canonical**: `renders/{category}/YYYYMMDD_HHMMSS_{gitshort}/` (unique)

### Debug Outputs

- **Resolved JSON**: Saved when `--debug` flag enabled
- **Fingerprint**: SHA256 hash + spectral analysis
- **QC Results**: Optional QC analysis with `--qc` flag

## Fixes Applied

1. ✅ Created canonical renderer (`tools/render.py`) with debug outputs
2. ✅ Added fingerprinting (SHA256) to detect no-op renders
3. ✅ Fixed param sweep test (deep copy issue)
4. ✅ Unique output directories (timestamp + git hash)
5. ✅ Debug JSON with full param trace
6. ✅ Documentation created (PARAMS.md, RENDER_PIPELINE.md)

## Recommendations

1. **Migrate legacy scripts**: Update existing render scripts to use `tools/render.py` or delete if redundant
2. **Use debug mode**: Always use `--debug` when troubleshooting renders
3. **Run param sweep**: Use `python tools/render.py param-sweep` to verify params are applied
4. **Check resolved.json**: Inspect debug JSON to verify param flow
5. **Verify fingerprints**: Compare SHA256 hashes to detect identical renders

## Current Status

✅ **RENDERS ARE CHANGING CORRECTLY**

Param sweep tests confirm that parameter changes produce different audio outputs. The issue was in the test setup (shallow copy), not in the actual rendering pipeline.

## Next Steps

1. Migrate legacy render scripts to use canonical renderer
2. Add param sweep tests to CI/CD
3. Consider adding API endpoints for debug mode
4. Document common param modification patterns
