# Repo Mapping & Current Parameter Audit (Prompt 0)

**Role:** Senior audio DSP engineer.  
**Task:** Map engines, parameters, envelopes, mixing, and render/export; then outline a refactor plan for a shared Parameter + Envelope system **without breaking the current API**.  
**No code changes** — audit only.

---

## 1. Where engines live, entrypoints, and relevant tree

### 1.1 Engine locations and entrypoints

| Instrument | File | Class(es) | Render entrypoint |
|------------|------|------------|--------------------|
| **Kick** | `engine/instruments/kick.py` | `FMLayer`, `KickEngine` | `KickEngine.render(params: dict, seed: int = 0) -> torch.Tensor` |
| **Snare** | `engine/instruments/snare.py` | `SnareEngine` | `SnareEngine.render(params: dict, seed: int = 0) -> torch.Tensor` |
| **Hat** | `engine/instruments/hat.py` | `HatEngine` | `HatEngine.render(params: dict, seed: int = 0) -> torch.Tensor` |

**API entrypoints (HTTP):**  
`engine/main.py` — FastAPI app.  
- `POST /generate/kick` → `params` (dict), pops `seed` → `KickEngine(48000).render(params, seed)` → `AudioIO.to_bytes(...)` → WAV response.  
- `POST /generate/snare` — same pattern.  
- `POST /generate/hat` — same pattern.

**Script/CLI-style usage:**  
- **Server:** `uvicorn engine.main:app --host 0.0.0.0 --port 8000` (or via `start.sh`).  
- **Direct render (no HTTP):** Tests and export code instantiate the engine and call `render(params, seed)` themselves. Example: `tests/verify_kick.py` imports `KickEngine`, builds a `params` dict, calls `kick.render(params, seed=123)`, then saves with `torchaudio.save(...)`.  
- **Export:** `Exporter.create_kit_zip(kit_data)` in `engine/export/exporter.py` dispatches by instrument name to the same engines and uses `AudioIO.to_bytes(audio, 48000)` to put WAVs in the ZIP.

There is **no** standalone CLI script (e.g. `python -m engine.cli render --instrument kick --params '...'`). “Entrypoint” for offline buffer→WAV is either (a) the test scripts, or (b) the API plus frontend/curl.

### 1.2 Relevant file tree

```text
engine/
├── main.py                    # FastAPI app, /generate/*, /propose/*, /feedback, /export/kit
├── core/
│   ├── io.py                  # AudioIO.save_wav(path), AudioIO.to_bytes() → WAV bytes
│   └── types.py               # AudioBuffer, RenderContext, Candidate (dsp_params: dict)
├── dsp/
│   ├── delay.py               # DelayLine (read_block, write_block; fractional delay)
│   ├── envelopes.py            # Envelope.exponential_decay, Envelope.adsr (not used by engines)
│   ├── filters.py              # Filter.{lowpass,highpass,bandpass}, Effects.{soft_clip,hard_clip,transient_shaper}
│   ├── noise.py               # Noise.white, Noise.pink
│   └── oscillators.py         # Oscillator.{sine,triangle,saw,square}
├── export/
│   └── exporter.py            # Exporter.create_kit_zip(kit_data) → ZIP with WAVs + kit_info.json
├── instruments/
│   ├── kick.py                # FMLayer, KickEngine
│   ├── snare.py               # SnareEngine
│   └── hat.py                 # HatEngine
└── ml/
    ├── dataset.py             # DatasetStore (JSONL)
    ├── model.py               # PreferenceModel
    ├── sampler.py             # Sampler.propose(param_space), Sampler.mutate(params, param_space)
    └── features.py            # Feature extraction (if used)

tests/
├── verify_kick.py             # KickEngine + render + torchaudio.save
├── verify_snare.py
├── debug_snare.py
└── test_oscillators.py
```

---

## 2. How parameters are defined and passed

### 2.1 Sources of parameter definitions

- **Param spaces (backend):** In `engine/main.py`, a global `PARAM_SPACES` dict defines per-instrument **(name → (min, max))** for proposal and mutation:
  - **Kick:** `punch_decay`, `click_amount`, `click_snap`, `room_tone_freq`, `room_air`, `distance_ms`, `blend` (all floats in given ranges).
  - **Snare:** `tone`, `wire`, `crack`, `body` (all 0..1).
  - **Hat:** `tightness`, `sheen`, `dirt`, `color` (all 0..1).

- **How they are passed:**  
  - **API:** `POST /generate/{kick,snare,hat}` receives a JSON body → Python `dict`. The handler does `params.pop("seed", 0)` then `engine.render(params, seed=seed)`. So the **contract** is: `params` is a plain `dict` (str → float/int), and `seed` can be inside it or separate; the route takes it out of the dict.  
  - **Sampler:** `Sampler.propose(PARAM_SPACES[instrument])` returns a single `Dict[str, float]` via `_random_sample` or model-guided pick. `GET /propose/{instrument}` returns that dict as JSON.  
  - **Export:** `kit_data['slots'][inst]` has `params` and `seed`; exporter passes `data['params']` and `data['seed']` into `Engine.render(params, seed)`.

- **Typed structures:**  
  - `engine/core/types.py` has `Candidate(dsp_params: Dict[str, Any], ...)` and `RenderContext(instrument, style, quality)`. The running code does **not** build `Candidate` or `RenderContext` in the HTTP or export paths; params are always plain dicts. So today there is **no** shared “Parameter” struct or schema used at runtime.

### 2.2 Summary

| Aspect | Current state |
|--------|----------------|
| **Definition** | `PARAM_SPACES` in `main.py` (name → (min, max)). No per-param default, unit, or “layer” metadata. |
| **Passing** | Always `dict` → `render(params: dict, seed: int)`. Same from API, tests, and exporter. |
| **Validation** | None. Engines use `params.get(name, default)` and assume float-like values. |
| **Structs** | `Candidate.dsp_params` is typed as dict; not used in generate/export flow. |

---

## 3. How envelopes are implemented (sample accuracy)

### 3.1 Shared envelope code (unused by instruments)

- **File:** `engine/dsp/envelopes.py`  
- **Content:**  
  - `Envelope.exponential_decay(duration, sample_rate, decay_time)` → builds `t = linspace(0, duration, int(duration*sample_rate))`, returns `exp(-t / (decay_time + 1e-6))`. So length is **sample-count aligned** to `duration * sample_rate`.  
  - `Envelope.adsr(duration, sample_rate, attack, decay, sustain, release, gate_duration)` → uses **sample-based segment lengths** (`int(attack*sample_rate)` etc.), then slice assignment. Shape is `int(duration * sample_rate)`.

So the **shared** envelope helpers are **sample-accurate** in the sense that they produce one value per output sample for the given `duration` and `sample_rate`. They are **not** used by any of the three engines: kick, snare, and hat all `from engine.dsp.envelopes import Envelope` but never call `Envelope.exponential_decay` or `Envelope.adsr`.

### 3.2 Per-engine envelope behavior

- **Kick:** Inside `FMLayer.render()`: `amp_env = exp(-t / amp_decay)`, `pitch_env = end_freq + (start_freq - end_freq) * exp(-t / pitch_decay)`, `fm_env = exp(-t / fm_decay) * fm_index_amt`, with `t = linspace(0, duration, num_samples)`. So envelope curves are **per-sample** for that layer’s `num_samples`.  
  - Layer mix has no envelope; it’s “Layer A + Layer B delayed × blend”.

- **Snare:** Exciter: body decay `exp(-t*20)`, air decay `exp(-t*50)` (t in seconds). Wires: `wire_env = exp(-t / wire_decay_t)` with `wire_decay_t = 0.2 + wire_amt*0.3`. Shell has no explicit envelope; decay comes from feedback gain and loop LPF. All use `t = linspace(0, duration, num_samples)` → **sample-accurate** length.

- **Hat:** Single global decay: `decay = 0.8 - tightness*0.76`, `env = exp(-t / decay)`, then `mix = mix * env`. Same idea: **sample-accurate** for the rendered buffer.

So envelopes are **implemented inline** as `exp(-t / τ)` or `exp(-t * k)` with `t` spanning the whole buffer. They are **sample-accurate** in the sense of one value per sample, but there is **no** shared ADSR, no per-layer attack/decay/sustain/release, and no explicit “layer envelope” abstraction.

---

## 4. Where mixing happens (layer gains, normalization, clipper/limiter)

### 4.1 Kick

| Stage | What happens |
|--------|----------------|
| **Layer A vs B** | `mix = signal_a + (signal_b_delayed * blend)`. Only `blend` (from params) controls Layer B level; Layer A is 1.0. |
| **Saturation** | `tanh(mix * drive)` with `drive = 1.0 + click_amount*0.5`. |
| **Level / safety** | After downsample: `peak = max(abs(mix))`; if peak &gt; 0, `mix = mix / peak * 0.95`. No separate limiter/clipper after that. |

So **mixing** = one explicit gain (`blend`) on Layer B; Layer A has no dedicated gain param. **Normalization** is in-engine to 0.95. Output is then passed to `AudioIO.to_bytes`, which clips to ±1.

### 4.2 Snare

| Stage | What happens |
|--------|----------------|
| **Exciter** | `(osc_body * 0.6) + (osc_air * 0.4)` — fixed 0.6/0.4, no params. |
| **Crack** | `exciter + bp_2k * boost_gain` with `boost_gain = 2.0 + crack_amt*2.0`. |
| **Shell vs wires** | `mix = shell_out + wires_out`. `wires_out = wires_sig * wire_env * wire_amt` — only `wire_amt` is from params; shell is 1.0. |
| **Limiting** | In the FDN loop: `Effects.soft_clip(..., threshold_db=-1.0)`. On exciter: `Effects.hard_clip(..., threshold_db=-2.0)`. |
| **Normalization** | At end: `mix = mix / peak * 0.95` if peak &gt; 0. |

So **layer gains**: exciter body/air fixed; wires scaled by `wire_amt`; shell has no independent level param. **Normalization** again in-engine to 0.95.

### 4.3 Hat

| Stage | What happens |
|--------|----------------|
| **Metal / Air / Chick** | `mix = layer_a + layer_b + layer_c` with no per-layer gains. Layer B level is `(sheen*0.5 + 0.2)` inside the expression for `layer_b`; chick is fixed `* 0.5`. |
| **Envelope** | `mix = mix * env` with `env = exp(-t / decay)` (decay from tightness). |
| **Dirt / saturation** | `mix = mix * (1 + dirt)` then `tanh(mix)`. |
| **Normalization** | After downsample: `mix = mix / peak * 0.95` if peak &gt; 0. |

So **mixing** is sum of three layers with **no** direct “layer A gain / layer B gain / layer C gain” knobs; only sheen and tightness shape level/decay. **Normalization** again in-engine to 0.95.

### 4.4 Export / API output

- **Export:** Uses each engine’s `render()` output as above; `AudioIO.to_bytes` does `np.clip(data, -1, 1)` and writes WAV. No extra “post chain” or global limiter.  
- **API:** Same: engine output → `AudioIO.to_bytes` → response. So **all** layer balance, saturation, and final peak handling are **inside** each engine; there is **no** shared “post chain” or master limiter module in the current map.

---

## 5. Where rendering/export happens and how to add tests

### 5.1 Rendering

- **Rendering** = `Engine.render(params, seed)` returning a 1D `torch.Tensor` (float, target sample rate after internal oversampling).  
- It is invoked from:  
  1. **API:** `engine/main.py` in each `POST /generate/{kick,snare,hat}`.  
  2. **Export:** `engine/export/exporter.py` in `Exporter.create_kit_zip` when building the ZIP (per slot, by instrument name).  
  3. **Tests:** e.g. `tests/verify_kick.py`, `tests/verify_snare.py` — direct `Engine(...).render(params, seed)` then torchaudio/save or checks.

### 5.2 Export

- **Export** = `Exporter.create_kit_zip(kit_data)` in `engine/export/exporter.py`.  
- **Input:** `kit_data` with `name`, `slots`: e.g. `slots['kick'] = { 'params': {...}, 'seed': N }`.  
- **Output:** Bytes of a ZIP containing `kit_info.json` and one WAV per slot (`kick.wav`, `snare.wav`, `hat.wav`). WAVs are produced with `AudioIO.to_bytes(audio, 48000)` (exporter uses `to_bytes`; note: `save_wav` in `io.py` expects a path, so the exporter correctly uses `to_bytes` and then `zip_file.writestr(...)`).

### 5.3 How to add tests

- **Unit tests:**  
  - Add tests (e.g. under `tests/`) that call `KickEngine(48000).render(params, seed)` (and snare/hat) with fixed `params` and `seed`, and assert: shape, sample rate, no NaN/Inf, peak in a desired range (e.g. &lt;= 1), optional checks on duration and determinism (same params+seed → same hash or tolerance).  
  - Reuse the same `params` dicts and seeds that the API/export use, so that “buffer → WAV” is covered both via direct render and, if desired, via a small script that calls the engine the same way the API does.

- **Integration-style tests:**  
  - **Export roundtrip:** Build a `kit_data` dict, call `Exporter.create_kit_zip(kit_data)`, unpack the ZIP, confirm `kit_info.json` and WAV entries exist, and optionally decode WAVs and assert duration/peak.  
  - **API contract:** If tests can call the app (e.g. `TestClient(app)`), `POST /generate/kick` with a known `params` and `seed`, then assert response content-type and that decoding the response body yields a valid WAV with expected length.  
  - **Determinism:** For a fixed `(params, seed)`, call `render` twice (or via API twice) and compare buffers (or hashes) to ensure bit-identical or within a tiny tolerance.

- **Placement:** Keep instrument-level tests next to existing `verify_*.py` (or in a `tests/unit/` / `tests/integration/` layout if you introduce that). Export and API tests can live in `tests/test_export.py`, `tests/test_api.py`, etc., and share small helpers that build `params` from the same structure as `PARAM_SPACES` (e.g. default or midpoint values per param).

---

## 6. Instrument layers and parameters controlling them

Short table: for each instrument, **layers** and the **parameters** that affect them (directly or via derived quantities). “Global” = applies to the whole sound (e.g. final balance or master processing).

| Instrument | Layer / region | Parameters involved | Notes |
|------------|----------------|---------------------|--------|
| **Kick** | Layer A (Punch) | `punch_decay`, `click_amount`, `click_snap`, `tune` | `tune` = end pitch; start pitch and FM shape from click_* |
| **Kick** | Layer B (Room) | `room_tone_freq`, `room_air`, `distance_ms` | Tone, FM “air”, and delay time |
| **Kick** | Mix / post | `blend` | Level of delayed Layer B. Drive uses `click_amount`. |
| **Snare** | Exciter (body + air) | `tone`, `crack` | `tone` → fund_freq; `crack` → 2k boost gain. Body/air mix 0.6/0.4 fixed. |
| **Snare** | Shell (FDN) | `body`, `tone` | `body` → feedback_gain; `tone` → fund_freq (hence delay tuning) |
| **Snare** | Wires | `wire`, `wire_amt` | Decay time and level of wire noise |
| **Snare** | Mix / post | — | No “shell level” vs “wire level” param; wires scaled by `wire_amt`. |
| **Hat** | Metal (Layer A) | `color` | `color` → base_hz. No “metal level” param. |
| **Hat** | Air (Layer B) | `sheen` | `sheen` in gain `(sheen*0.5 + 0.2)`. |
| **Hat** | Chick (Layer C) | — | Fixed gain 0.5; no param. |
| **Hat** | Global decay / post | `tightness`, `dirt`, `color` | `tightness` → decay time; `dirt` → crush + saturation; `color` → HPF. |

---

## 7. Refactor plan: shared Parameter + Envelope system without breaking API

### 7.1 Principles

- **Preserve surface:** `render(params: dict, seed: int) -> Tensor` and `POST /generate/{kick,snare,hat}` with a JSON body that becomes that `params` dict remain unchanged.  
- **Internals:** Introduce shared **parameter** and **envelope** abstractions used **inside** each engine; engines still accept `dict` and can **adapt** dict → internal representation at the top of `render()`.

### 7.2 Parameter system

- **Add a small parameter schema** (e.g. in `engine/core/` or `engine/dsp/`): each parameter has at least `name`, `default`, `min`, `max`, and optionally `layer` (or “role”) for documentation/UI.  
- **Per-instrument param definitions:** For each instrument, define a list or dict of these parameter descriptors (aligned with current `PARAM_SPACES` and `params.get(name, default)` behavior). Use them to:  
  - **Parse** the incoming `params` dict into a typed object or validated dict (e.g. `KickParams` dataclass or a validated dict with known keys and defaults).  
  - **Provide defaults** when a key is missing, and optionally clamp to (min, max).  
- **API contract:** Keep `params` as a plain dict in and out of the HTTP and export paths. The **only** change is inside `Engine.render()`: first line can be `params = normalize_params(params, KICK_PARAM_SCHEMA)` or `params = KickParams.from_dict(params)` so the rest of the engine sees consistent, typed or validated values.  
- **PARAM_SPACES:** Can remain the single source of (min, max) for the sampler; the new schema can reference the same ranges and add defaults and layer hints. Optionally, `PARAM_SPACES` is later generated from the schema so there is one source of truth.

### 7.3 Envelope system

- **Shared envelope API:** Add (or extend) an envelope helper that all engines can call, e.g. `Envelope.ar(duration, sample_rate, attack, decay)` or `Envelope.adsr(...)` that returns a `[num_samples]` tensor, **sample-accurate** for that `duration` and `sample_rate`. Keep `engine/dsp/envelopes.py` as the place for this.  
- **Per-layer ADSR (or AR):** For “Kick 2–style” control, add **optional** params per layer, e.g. for kick: `layer_a_attack`, `layer_a_decay`, `layer_a_sustain`, `layer_a_release`, `layer_a_gain`, and similarly for layer B. Defaults are chosen so that with all new params at default, the current sound and behavior are preserved (e.g. current effective “attack” is 0, “decay” mapped from `punch_decay`).  
- **Wiring:** Inside each engine, instead of inline `exp(-t/...)`, call e.g. `env = Envelope.ar(duration, self.sample_rate, attack, decay)` or `Envelope.adsr(...)`, and use it for that layer. New keys are read from the same `params` dict (with defaults), so existing clients that don’t send them still work.  
- **Backward compatibility:** If a param is absent, use the same formula as today (e.g. `amp_decay = 0.1 + punch_decay*0.4`). If present, use it for the new envelope (and optionally ignore or blend with the old mapping for a transition period).

### 7.4 Layer mixers (Kick 2–style)

- **Per-layer gain:** Add optional `layer_a_gain`, `layer_b_gain` (and for snare/hat, equivalents for their layers). In the sum, use e.g. `mix = signal_a * layer_a_gain + signal_b_delayed * blend * layer_b_gain`, with defaults 1.0 so current behavior is unchanged.  
- **Where it lives:** Logic stays inside each instrument; only the **source** of the gain values comes from the shared parameter normalization (so `params['layer_a_gain']` or `kick_params.layer_a_gain` with default 1.0).  
- **Macros:** Keep existing macros (`blend`, `punch_decay`, etc.); they can remain the main “macro” controls, and the new layer gains can be “micro” controls, or vice versa, without changing the HTTP or `render(params, seed)` signature.

### 7.5 Suggested order of work

1. **Parameter schema + parsing**  
   - Add schema (or dataclass) per instrument and a `from_dict` / `normalize_params` step at the top of `render()`.  
   - Use it only to fill defaults and clamp; don’t rename or remove existing keys yet.  
   - Optionally make `PARAM_SPACES` derive from this schema.

2. **Envelope facade**  
   - Ensure `Envelope.ar` or `Envelope.adsr` is sample-accurate and matches current buffer length.  
   - In one engine (e.g. kick), replace **one** inline decay with a call to `Envelope`, using existing params (e.g. punch_decay) to derive attack/decay.  
   - Compare output with current (e.g. determinism + listening or regression test) and then roll out to other layers.

3. **Per-layer ADSR + gain (optional params)**  
   - Add optional `layer_*_attack/decay/sustain/release/gain` (or a subset) to the schema with “current behavior” defaults.  
   - In engines, if present, use them; otherwise keep current formulas.  
   - Extend `PARAM_SPACES` (or schema) so proposer/sampler can expose them if desired.

4. **Tests**  
   - Add tests that render with “legacy” param sets (no new keys) and, if needed, with new keys at default, and assert same or very close result to current behavior.  
   - Add tests that change only the new envelope/gain params and assert non-silence and sane peak/curve.

This keeps the public API (`dict` in, `Tensor` out, same HTTP and export behavior) and allows a staged introduction of shared Parameter and Envelope logic inside the engines.
