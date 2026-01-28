# Snare Multi-Transient Fix - Implementation Summary

## Problem
Snare drums were producing multiple transients/echoes instead of a single one-shot due to:
1. **FDN feedback always active**: `feedback_gain = 0.85 + (body_amt * 0.11)` was always >= 0.85, causing audible repeats
2. **Room layer always computed**: Room layer was computed even when muted, wasting CPU
3. **Potential double-application**: Legacy macros (`wire`, `crack`) were being set by envelope mapping, potentially conflicting with user-provided macros

## Solution

### Step 0: Debug Logging ✅
- Added comprehensive debug logging in `engine/instruments/snare.py`:
  - Logs incoming params (legacy macros + nested)
  - Logs FDN feedback settings
  - Logs repeat mode and room layer state
  - Logs final layer mixer states

### Step 1: Parameter Application Audit ✅
- Documented all snare param application points in `docs/dev/snare_param_application_points.md`
- Identified 7 application points (frontend + backend)
- Found issues: FDN feedback always active, room always computed, potential double-application

### Step 2: Schema Versioning + Migration ✅
- Created `frontend/src/audio/patch/migration.ts`:
  - `migratePatchToV1()`: Migrates V0 patches (no schemaVersion) to V1
  - `validateCanonicalPatch()`: Validates V1 patches have no deprecated fields
- V1 patches include:
  - `schemaVersion: 1`
  - `params`: Macro parameters
  - `envelopeParams`: Envelope UI parameters
  - `repeatMode`: `"oneshot" | "roll" | "echo"` (default: `"oneshot"`)
  - `roomEnabled`: Boolean (default: `false`)
- Legacy patches with delay/room params are automatically migrated to oneshot mode with room disabled

### Step 3: Fix Snare FX Chain ✅
**Backend (`engine/instruments/snare.py`):**
- Added `snare.repeatMode` parameter (default: `"oneshot"`)
- Added `snare.shell.feedback` parameter for explicit control
- **Oneshot mode**: If `repeatMode == "oneshot"` and no explicit feedback, set `feedback_gain = 0.0`
- Added `snare.room.enabled` parameter (default: `false`)
- Room layer only computed if `roomEnabled == true`

**Frontend (`frontend/src/components/AuditionView.tsx`):**
- `mergeParams()` now sets `snare.repeatMode = "oneshot"` by default for snare
- Sets `snare.shell.feedback = 0.0` for oneshot mode
- Sets `snare.room.enabled = false` and `snare.room.mute = true` by default

**Frontend (`frontend/src/audio/mapping/mapSnareParams.ts`):**
- Removed legacy macro setting (`wire`, `crack`) to prevent double-application
- Only sets nested params (`snare.wires.*`, `snare.exciter_body.*`)

### Step 4: Prevent Double-Triggering ✅
- Added `lastTriggerTimeRef` to track last trigger time
- Added `TRIGGER_DEBOUNCE_MS = 50ms` minimum time between triggers
- `handleGenerate()` now skips if triggered within 50ms (unless `skipEnvelopeMerge` is true)
- Prevents rapid-fire API calls from causing multiple renders

### Step 5: Tests + Regression Preset ✅
**Tests:**
- `frontend/src/audio/patch/__tests__/migration.test.ts`: Tests patch migration
- `frontend/src/audio/mapping/__tests__/snareOneshot.test.ts`: Tests oneshot parameter mapping

**Regression Preset:**
- `presets/Snare_Default_OneShot.json`: Canonical oneshot preset with:
  - `repeatMode: "oneshot"`
  - `roomEnabled: false`
  - All envelope params at defaults

## Key Changes

### Backend (`engine/instruments/snare.py`)
```python
# Before:
feedback_gain = 0.85 + (body_amt * 0.11)  # Always >= 0.85

# After:
feedback_gain = 0.85 + (body_amt * 0.11)
if repeat_mode == "oneshot" and explicit_feedback is None:
    feedback_gain = 0.0  # Disable for oneshot
```

### Frontend (`frontend/src/components/AuditionView.tsx`)
```typescript
// Sets oneshot mode by default for snare
if (inst === "snare") {
    merged["snare"]["repeatMode"] = "oneshot";
    merged["snare"]["shell"]["feedback"] = 0.0;
    merged["snare"]["room"]["enabled"] = false;
}
```

## Verification

1. **Default Behavior**: Snare should produce a single transient with no repeats
2. **Debug Logs**: Check backend logs for `[SNARE RENDER]` messages:
   - `FDN feedback_gain: 0.0` (for oneshot)
   - `Repeat mode: oneshot`
   - `Room enabled: False`
3. **Patch Migration**: Old patches are automatically migrated to V1 with oneshot defaults
4. **Double-Trigger Prevention**: Rapid slider changes don't cause multiple API calls

## Future Enhancements

- Add UI controls for `repeatMode` (oneshot/roll/echo toggle)
- Add UI control for `roomEnabled` toggle
- Add UI control for `snare.shell.feedback` slider (when repeatMode != "oneshot")
- Remove debug logging in production builds

## Files Modified

**Backend:**
- `engine/instruments/snare.py`: Added repeat mode logic, room control, debug logging

**Frontend:**
- `frontend/src/components/AuditionView.tsx`: Added schema versioning, oneshot defaults, double-trigger prevention
- `frontend/src/audio/mapping/mapSnareParams.ts`: Removed legacy macro setting
- `frontend/src/audio/patch/migration.ts`: New patch migration system
- `frontend/src/audio/patch/__tests__/migration.test.ts`: Migration tests
- `frontend/src/audio/mapping/__tests__/snareOneshot.test.ts`: Oneshot mapping tests

**Documentation:**
- `docs/dev/snare_param_application_points.md`: Parameter application audit
- `docs/dev/SNARE_ONESHOT_FIX.md`: This document
- `presets/Snare_Default_OneShot.json`: Regression preset
