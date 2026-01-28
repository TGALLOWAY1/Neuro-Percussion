# ADSR + Layer Controls Implementation Audit

**Date:** 2026-01-27  
**Scope:** Verify ADSR module, per-layer controls, and identify gaps

---

## ✅ Checklist Results

### A) ADSR Module Exists?
**YES** ✅

- **Location:** `engine/dsp/envelopes.py` lines 90-187
- **Class:** `ADSR` with `render(duration_s, gate_s=None)` method
- **Features:** Sample-accurate, supports "linear"/"exp" curves, handles Attack/Hold/Decay/Sustain/Release
- **Evidence:**
  ```python
  class ADSR:
      def __init__(self, sample_rate, attack_s, decay_s, sustain_level, release_s, hold_s=0.0, curve="exp")
      def render(self, duration_s: float, gate_s: Optional[float] = None) -> torch.Tensor
  ```

### B) Each Instrument Uses ADSR?
**YES** ✅ (for per-layer AMP envelopes)

- **Kick:** `_amp_env_for_layer()` → `ADSR.render()` → applied to sub/click/knock/room (lines 15-53, 166-183)
- **Snare:** `_snare_amp_env()` → `ADSR.render()` → applied to exciter_body/air/shell/wires/room (lines 43-87, 197-210)
- **Hat:** `_hat_amp_env()` → `ADSR.render()` → applied to metal/air/chick (lines 16-40, 135-143)

**Note:** Inline `torch.exp(-t/decay)` still exists in:
- `FMLayer.render()` (kick internal FM synthesis) - **OK, internal algorithm**
- `knock_audio` decay (kick.py:140) - **OK, internal synthesis**
- `osc_body/osc_air` decays (snare.py:123-124) - **OK, exciter synthesis**
- `wire_env` (snare.py:188) - **OK, internal wire decay**
- `hat` global decay (hat.py:159) - **OK, global tightness control**

These are **synthesis parameters**, not per-layer AMP envelopes. ADSR is correctly used for layer amplitude shaping.

### C) Are ADSR Params Actually Read from `params: dict`?
**YES** ✅

All instruments use `get_param()` with dotted keys:
- **Kick:** `kick.{layer}.amp.decay_ms`, `attack_ms`, `sustain`, `release_ms` (lines 26-44)
- **Snare:** `snare.{layer}.amp.decay_ms`, etc. (lines 55-78)
- **Hat:** `hat.{layer}.amp.decay_ms`, etc. (lines 26-29)

**Example:**
```python
decay_ms = get_param(params, f"{prefix}.decay_ms", (0.1 + punch_decay * 0.4) * 1000)
attack_ms = get_param(params, f"{prefix}.attack_ms", 0.0)
```

### D) Are Per-Layer Gains/Faders Read from Params?
**YES** ✅

- **LayerMixer:** `engine/dsp/mixer.py` lines 67-70
  - Reads `{instrument}.{layer}.gain_db` via `get_db_gain()`
  - Reads `{instrument}.{layer}.mute` via `get_param()`
- **All instruments call:** `mixer.mix(params, "kick"/"snare"/"hat", default_specs)`
  - Kick: line 197
  - Snare: line 230
  - Hat: line 155

**Evidence:**
```python
gain_key = f"{instrument}.{name}.gain_db"
mute_key = f"{instrument}.{name}.mute"
gain_lin = get_db_gain(params, gain_key, default_db)
mute = get_param(params, mute_key, default_mute)
```

### E) Is There Still Per-Engine "Normalize to 0.95" That Would Cancel Faders?
**YES** ⚠️ (but behind `legacy_normalize` flag)

- **Kick:** lines 207-210
- **Snare:** lines 236-239
- **Hat:** lines 177-180

**Code:**
```python
if params.get("legacy_normalize", False):
    peak = torch.max(torch.abs(master))
    if peak > 0:
        master = master / peak * 0.95
```

**Impact:** If `legacy_normalize=True`, peak normalization cancels fader changes. However:
- Default is `False` (opt-in)
- PostChain already handles safety clamping (max 0.92)
- This is a **backward compatibility gate**, not active by default

---

## 🔍 Additional Findings

### 1. PostChain Safety ✅
- **Location:** `engine/dsp/postchain.py`
- **Features:** DC block, boundary fades (0.5ms in, 2ms out), soft clip at -0.8 dBFS, safety clamp ≤ 0.92
- **Status:** All instruments call `PostChain.process()` before return

### 2. PARAM_SPACES (main.py) ✅
- **Lines 103-115:** Only macro params (punch_decay, tone, tightness, etc.)
- **Comment (line 101):** "Advanced params (per-layer gain_db/mute, ADSR, etc.) are manual/UI-only for now"
- **Status:** Correctly excludes advanced params from ML proposal space

### 3. AudioIO.to_bytes Clipping ⚠️
- **Location:** `engine/core/io.py` line 39
- **Code:** `data = np.clip(data, -1.0, 1.0)`
- **Issue:** Hard clips to ±1.0, but PostChain already ensures ≤ 0.92
- **Impact:** Should never trigger, but redundant clamp exists

---

## 📋 What's Missing / Gaps

### 1. **No ADSR Params in PARAM_SPACES** (by design)
- ADSR params are not exposed to ML proposer/mutator
- **Status:** Intentional (comment says "manual/UI-only")
- **Action:** None needed if UI will expose these separately

### 2. **Legacy Normalize Still Exists** (opt-in)
- Could cancel fader changes if enabled
- **Status:** Behind flag, default False
- **Action:** Consider removing entirely if not needed for backward compat

### 3. **No Default ADSR Values Documented**
- Defaults are computed from macro params (e.g., `punch_decay * 0.4`)
- **Status:** Works, but no schema/doc for UI
- **Action:** Optional: add param schema/validation

### 4. **AudioIO.to_bytes Redundant Clamp**
- Clamps to ±1.0 but PostChain already ensures ≤ 0.92
- **Status:** Harmless but redundant
- **Action:** Optional cleanup

---

## ✅ Minimum Edits Needed

**If goal is "make ADSR/faders real":** ✅ **Already implemented**

No changes needed. ADSR and layer faders are:
- ✅ Implemented in code
- ✅ Read from params dict
- ✅ Applied to all layers
- ✅ Not canceled by default (legacy_normalize=False)

**Optional improvements:**
1. Remove `legacy_normalize` blocks if backward compat not needed
2. Document ADSR param schema for UI
3. Remove redundant clamp in `AudioIO.to_bytes` (or keep as safety net)

---

## 📊 Summary

| Component | Status | Evidence |
|-----------|--------|----------|
| ADSR module | ✅ Implemented | `engine/dsp/envelopes.py` ADSR class |
| Kick uses ADSR | ✅ Yes | `_amp_env_for_layer()` → ADSR.render() |
| Snare uses ADSR | ✅ Yes | `_snare_amp_env()` → ADSR.render() |
| Hat uses ADSR | ✅ Yes | `_hat_amp_env()` → ADSR.render() |
| ADSR params read | ✅ Yes | `get_param()` with dotted keys |
| Layer gains read | ✅ Yes | LayerMixer uses `get_db_gain()` |
| Layer mutes read | ✅ Yes | LayerMixer uses `get_param()` |
| Legacy normalize | ⚠️ Exists (opt-in) | Behind `legacy_normalize` flag, default False |

**Conclusion:** ADSR and layer controls are **fully implemented and functional**. The only potential issue is `legacy_normalize` (opt-in), which could cancel faders if enabled, but it's disabled by default.
