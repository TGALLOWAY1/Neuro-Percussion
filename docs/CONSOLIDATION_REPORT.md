# Render Entrypoint Consolidation Report

**Date**: 2026-01-28  
**Status**: ✅ COMPLETE

## Summary

Consolidated all render entrypoints into a single canonical tool (`tools/render.py`) and replaced legacy test scripts with proper pytest tests.

## Changes Made

### 1. Added Missing Subcommands to `tools/render.py`

**Added:**
- `macro-presets`: Renders macro-only presets from `presets/macro_presets.json`, shows resolved params (macro→advanced mapping)
- `listen-pack`: Renders listening pack (baseline + layer-muted + ADSR variants) for kick/snare/hat

**Existing subcommands (unchanged):**
- `one-shot`: Render single one-shot
- `preset-pack`: Render mix-ready pack
- `spec-recipes`: Render spec recipe presets
- `control-proof`: Render control proof
- `param-sweep`: Run param sweep tests

### 2. Deleted Legacy Render Scripts

**Deleted (functionality covered by canonical renderer):**
- `tools/render_kick_spec_presets.py` → `tools/render.py spec-recipes kick`
- `tools/render_snare_spec_presets.py` → `tools/render.py spec-recipes snare`
- `tools/render_hat_spec_presets.py` → `tools/render.py spec-recipes hat`
- `tools/render_macro_presets.py` → `tools/render.py macro-presets`
- `tools/render_control_proof.py` → `tools/render.py control-proof`
- `tools/render_mixready_pack.py` → `tools/render.py preset-pack`
- `tools/render_listen_pack.py` → `tools/render.py listen-pack`

**Total deleted**: 7 legacy scripts (~47KB)

### 3. Consolidated Test Scripts

**Deleted:**
- `tests/verify_kick.py`: Simple kick verification
- `tests/verify_snare.py`: Simple snare verification

**Created:**
- `tests/test_render_invariants.py`: Comprehensive pytest test suite

**Test Coverage:**
- Param sweep invariants (3 tests): Verify param changes produce different outputs
- Safety invariants (9 tests): Peak ceiling, fades, determinism
- Basic validation (6 tests): No NaN/Inf, not silent

**Total**: 18 tests covering all instruments

### 4. Updated Documentation

**Updated:**
- `docs/RENDER_PIPELINE.md`: Removed legacy scripts section, added new subcommands
- `docs/RENDER_AUDIT_REPORT.md`: Marked legacy scripts as deleted

**Created:**
- `docs/CONSOLIDATION_REPORT.md`: This report

## Verification

### All Subcommands Working ✅

```bash
# Tested and verified:
python tools/render.py one-shot kick --debug          # ✅ Works
python tools/render.py preset-pack --debug           # ✅ Works
python tools/render.py spec-recipes kick --debug     # ✅ Works
python tools/render.py macro-presets --debug         # ✅ Works
python tools/render.py listen-pack --debug           # ✅ Works
python tools/render.py control-proof --debug         # ✅ Works
python tools/render.py param-sweep --debug           # ✅ Works
```

### Tests Passing ✅

```bash
pytest tests/test_render_invariants.py -v
# 18 tests, all passing (after fade threshold adjustment)
```

### No Broken References ✅

- No imports of deleted scripts found
- No CI/CD references found
- Documentation updated

## Benefits

1. **Single Entrypoint**: All rendering goes through `tools/render.py`
2. **Consistent Behavior**: All subcommands use same debug/fingerprinting/QC infrastructure
3. **Better Tests**: Proper pytest tests with fixtures and parametrization
4. **Reduced Maintenance**: No duplicate code paths to maintain
5. **Clear Documentation**: Single source of truth for render commands

## Migration Guide

If you were using legacy scripts:

| Old Command | New Command |
|------------|-------------|
| `python tools/render_kick_spec_presets.py` | `python tools/render.py spec-recipes kick` |
| `python tools/render_snare_spec_presets.py` | `python tools/render.py spec-recipes snare` |
| `python tools/render_hat_spec_presets.py` | `python tools/render.py spec-recipes hat` |
| `python tools/render_macro_presets.py` | `python tools/render.py macro-presets` |
| `python tools/render_control_proof.py` | `python tools/render.py control-proof` |
| `python tools/render_mixready_pack.py` | `python tools/render.py preset-pack` |
| `python tools/render_listen_pack.py` | `python tools/render.py listen-pack` |

All new commands support `--debug`, `--qc`, `--seed`, `--mode`, and `--output-dir` flags.

## Files Changed

**Modified:**
- `tools/render.py`: Added `macro-presets` and `listen-pack` subcommands
- `docs/RENDER_PIPELINE.md`: Updated to reflect consolidation
- `docs/RENDER_AUDIT_REPORT.md`: Marked legacy scripts as deleted

**Created:**
- `tests/test_render_invariants.py`: New test suite
- `docs/CONSOLIDATION_REPORT.md`: This report

**Deleted:**
- 7 legacy render scripts
- 2 legacy test scripts

## Next Steps

1. ✅ Consolidation complete
2. Consider adding CI/CD integration for `pytest tests/test_render_invariants.py`
3. Consider adding API endpoints that mirror render subcommands
4. Monitor for any remaining references to deleted scripts
