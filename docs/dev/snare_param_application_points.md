# Snare Parameter Application Points

## Overview
This document lists all places where snare parameters are applied, mapped, or transformed before reaching the engine.

## Backend Application Points

### 1. `engine/instruments/snare.py` - `resolve_snare_spec_params()`
- **Location**: Lines 20-161
- **What it applies**: Maps `snare.spec.*` parameters to internal nested params
- **Type**: New mapping (spec surface)
- **Output**: Returns implied params dict that gets merged with user params
- **Notes**: Only applies if `snare.spec.*` keys exist; user-provided advanced params take precedence

### 2. `engine/instruments/snare.py` - `SnareEngine.render()`
- **Location**: Lines 261-488
- **What it applies**: 
  - Legacy macros: `tone`, `wire`, `crack`, `body` (lines 284-287)
  - Nested params via `get_param()`: `snare.shell.pitch_hz`, `snare.shell.amp.*`, `snare.wires.*`, etc.
  - FDN feedback: `feedback_gain = 0.85 + (body_amt * 0.11)` (line 336) - **ALWAYS ACTIVE**
  - Room layer: Always computed but muted by default (line 412)
- **Type**: Direct engine consumption
- **Notes**: 
  - **ISSUE**: FDN feedback is always >= 0.85, causing multiple transients
  - **ISSUE**: Room layer computed even when muted

### 3. `engine/params/resolve.py` - `resolve_params()`
- **Location**: Called from `engine/main.py` before engine.render()
- **What it applies**: Deep-merges `DEFAULT_PRESET[instrument]` with incoming params
- **Type**: Parameter resolution (new system)
- **Notes**: Handles nested params, macros, and spec params

### 4. `engine/params/macros.py` - `apply_macros()` (if exists)
- **Location**: Called from `resolve_params()` if macro keys detected
- **What it applies**: Maps macro knobs to advanced params
- **Type**: Macro mapping (new system)
- **Notes**: May create implied params that get merged

## Frontend Application Points

### 5. `frontend/src/components/AuditionView.tsx` - `mergeParams()`
- **Location**: Lines 90-122
- **What it applies**: Merges macro params + envelope params
- **Type**: Frontend mapping
- **Notes**: 
  - Calls `mapSnareParams()` for envelope params
  - Deep merges mapped params with macro params
  - **POTENTIAL ISSUE**: May be applying params twice if macros already include envelope values

### 6. `frontend/src/audio/mapping/mapSnareParams.ts` - `mapSnareParams()`
- **Location**: Lines 32-111
- **What it applies**: Maps envelope UI params to backend nested format
- **Type**: New mapping (envelope controls)
- **Output**: Returns nested dict like `{ snare: { shell: { amp: { decay_ms: ... } } } }`
- **Notes**: 
  - Also sets legacy macros: `wire`, `crack` (lines 75, 96)
  - **POTENTIAL ISSUE**: Setting legacy macros may conflict with user-provided macros

### 7. `frontend/src/components/AuditionView.tsx` - `handleGenerate()`
- **Location**: Lines 124-159
- **What it applies**: Sends merged params to API
- **Type**: API call
- **Notes**: Calls `generateAudio()` with merged params

## Parameter Flow Summary

```
Frontend:
  DEFAULT_PARAMS[snare] (macros: tone, wire, crack, body)
  + envelopeParams (from EnvelopeStrip)
  → mergeParams() 
    → mapSnareParams() (envelope → nested)
    → deepMerge(macros, mapped)
  → handleGenerate()
    → POST /generate/snare

Backend:
  POST /generate/snare receives params
  → resolve_params() 
    → apply_macros() (if macros exist)
    → deepMerge(DEFAULT_PRESET, user_params)
  → resolve_snare_spec_params() (if spec.* keys exist)
    → merge spec_implied into params
  → SnareEngine.render(params)
    → Reads legacy macros: tone, wire, crack, body
    → Reads nested params: snare.shell.*, snare.wires.*, etc.
    → **APPLIES FDN FEEDBACK** (always >= 0.85)
    → Computes room layer (always, even if muted)
```

## Issues Identified

1. **FDN Feedback Always Active**: `feedback_gain = 0.85 + (body_amt * 0.11)` is always >= 0.85, causing multiple transients
2. **Room Layer Always Computed**: Room layer is computed even when muted, wasting CPU
3. **Potential Double Application**: 
   - `mapSnareParams()` sets legacy macros (`wire`, `crack`)
   - These may conflict with user-provided macros
   - Both legacy and nested params may be read in engine
4. **No Explicit Control**: No way to disable FDN feedback or room layer for one-shot mode

## Recommendations

1. Add `snare.repeatMode` parameter: `"oneshot" | "roll" | "echo"`
2. Default `repeatMode = "oneshot"` → disable FDN feedback (`feedback_gain = 0`)
3. Add `snare.room.enabled` parameter (default `false`)
4. Add `snare.shell.feedback` parameter for explicit control
5. Remove legacy macro setting from `mapSnareParams()` to avoid conflicts
