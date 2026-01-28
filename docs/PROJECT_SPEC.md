# Neuro-Percussion — Technical Project Spec

**Audience:** Developer continuing work on this codebase.  
**Purpose:** Exact description of how the three drum instruments are synthesized, assumptions, hard-coded parameters, and known or likely sources of bad results.  
**Context:** See `PRD.md` for product/scope; this document is DSP- and implementation-focused.

---

## 1. Overview & Architecture

The engine renders **kick**, **snare**, and **hi-hat** offline at 48 kHz (mono float32). Each instrument has its own class in `engine/instruments/` and uses shared DSP in `engine/dsp/` (oscillators, envelopes, filters, delay, noise). The API is under `engine/main.py`; each `/generate/{kick,snare,hat}` endpoint instantiates the corresponding engine, calls `render(params, seed)`, and returns WAV bytes.

**Assumptions that affect all instruments:**

- **Sample rate:** 48 kHz unless an engine oversamples. Oversampling is used for nonlinear stages (e.g. saturation, clipping).
- **Duration:** All one-shots use a fixed **0.5 s** duration. No per-note or style-based duration.
- **Determinism:** `torch.manual_seed(seed)` is set at the start of each `render()`. Given `(params, seed)`, output is intended to be bit-identical.
- **Normalization:** Each engine applies a final peak-normalize to **0.95** (−0.8 dBFS style) when peak &gt; 0. The PRD asks for max true peak ≤ −0.8 dBFS; the constant `0.95` is an approximation and may need tuning for different headroom targets.
- **Global post-chain:** The PRD describes a shared “Production Post-Chain” (DC block, HPF, transient shaper, saturation, style, soft clipper). The current implementation does **not** run instruments through a unified post-chain; each engine does its own saturation/HPF/LPF and then normalizes. A future “PostChain” module would need to be wired in.

---

## 2. Kick Drum

### 2.1 Intended Design

- **Architecture:** “Dual-layer FM” — Layer A = near-field punch + click; Layer B = room/resonance, delayed and blended.
- **Reference:** PRD §5.1 “Modern Punch & Knock” (Sub + Knock + Click). The code implements this as **FM-only** layers, not a literal “Sub sine + Knock bandpass + Click noise” split.

### 2.2 Actual Signal Path

1. **FMLayer** (shared by both layers):  
   - **Carrier:** Sinusoid. Phase = `2π × cumsum(inst_freq / sample_rate)`.  
   - **Modulator:** White noise `torch.randn_like(t)`.  
   - **Instantaneous frequency:**  
     `inst_freq = pitch_env + (noise_mod * fm_env * 5000.0)`  
     then `inst_freq = abs(inst_freq)` (no negative frequencies).  
   - **Envelopes:**  
     - Amp: `exp(-t / amp_decay)`  
     - Pitch: `end_freq + (start_freq - end_freq) * exp(-t / pitch_decay)`  
     - FM index shape: `exp(-t / fm_decay) * fm_index_amt`  
   So “click” comes from fast FM by noise (high bandwidth, short fm_decay).

2. **Layer A (Punch):**  
   - `start_freq = 150 + click_amount * 100`  
   - `end_freq = tune` (default 45 Hz)  
   - `pitch_decay = 0.08` (fixed)  
   - `amp_decay = 0.1 + punch_decay * 0.4`  
   - `fm_index_amt = click_amount`, `fm_decay = 0.005 + click_snap * 0.02`  
   - Rendered at **4× oversample** (192 kHz internal).

3. **Layer B (Room):**  
   - Fixed pitch: `start_freq = end_freq = room_tone_freq` (default 150 Hz).  
   - `pitch_decay = 1.0` (unused), `amp_decay = 0.2`, `fm_index_amt = room_air * 0.2`, `fm_decay = 0.1`.  
   - Output is passed through a **delay line** to simulate distance: read from the past by `distance_ms`, write current chunk. Processed in blocks of **1024** samples.  
   - Mixed: `mix = signal_a + (signal_b_delayed * blend)`.

4. **Post:**  
   - Saturation: `tanh(mix * drive)` with `drive = 1.0 + click_amount * 0.5`.  
   - Anti-alias LPF at `target_sr/2 - 1000` Hz (23 kHz when target_sr=48k), then downsample by 4×.  
   - Peak-normalize to 0.95.

### 2.3 Kick Hard-Coded Parameters

| Location | Value | Meaning |
|----------|--------|---------|
| `FMLayer.render` | `5000.0` | FM deviation (Hz) in `inst_freq = pitch_env + (noise_mod * fm_env * 5000.0)`. `fm_index_amt` only scales the envelope, not this constant. |
| `FMLayer.render` | `2000.0` | Unused (dead code in comment/deviation line). |
| Layer A | `150.0`, `100.0` | Start freq = `150 + click_amount*100`. |
| Layer A | `0.08` | Pitch decay time (s); controls “drop” speed. |
| Layer A | `0.1`, `0.4` | Amp decay = `0.1 + punch_decay*0.4`. |
| Layer A | `0.005`, `0.02` | FM decay = `0.005 + click_snap*0.02` (5–25 ms). |
| Layer B | `0.2` | Amp decay for room layer. |
| Layer B | `0.2` | Room FM index scale: `room_air * 0.2`. |
| Layer B | `0.1` | FM decay for room layer. |
| KickEngine | `oversample_factor = 4` | Internal SR = 192 kHz. |
| KickEngine | `0.05 * sample_rate` | Delay line max length (50 ms). |
| KickEngine | `1024` | Block size for delay processing. |
| Post | `1.0`, `0.5` | Drive = `1.0 + click_amount*0.5`. |
| Post | `target_sr/2 - 1000` | LPF cutoff before downsample (e.g. 23 kHz). |
| Post | `0.95` | Normalization peak. |

### 2.4 Kick Assumptions & Risks

- **FM deviation fixed at 5 kHz:** The “click” strength is tied to envelope (`click_amount`, `click_snap`) but max deviation is always 5000 Hz. Very low or very high `tune` can make the click feel wrong; there is no scaling with fundamental.
- **Layer B is not “Knock” in the PRD sense:** PRD describes a “Knock” as damped sine or resonant bandpass 100–250 Hz. The code uses an FM layer at `room_tone_freq` with noise modulation. So “room” is FM-colored tone, not a separate resonant knock layer.
- **Delay semantics:** Layer B is delayed by `distance_ms` then blended. So “distance” is implemented as a single delay, not early reflections or reverb. The delay line length is 50 ms; `distance_ms` is clamped only by the API/param space (e.g. 0–50 ms).
- **Oversample and LPF:** Anti-alias at `target_sr/2 - 1000` is reasonable; the −1000 is a guard. If `target_sr` changed, this expression would need to stay below Nyquist.

---

## 3. Snare Drum

### 3.1 Intended Design

- **Architecture:** “FDN” shell (feedback delay network) + exciter (body + air) + “wires” layer. PRD §5.2 describes Modal Shell + Snap + Wires.
- **Reference:** Modal shell (4–6 damped resonators), Snap (short impulse + 2 ms noise burst), Wires (noise through dynamic bandpass).

### 3.2 Actual Signal Path

1. **Exciter (Module A)**  
   - **Body:** `Oscillator.triangle(fund_freq, duration, sample_rate)` with `fund_freq = 150 + tone*150` (150–300 Hz), then multiplied by `exp(-t*20)`.  
   - **Air:** `(torch.rand_like(t)*2 - 1) * exp(-t*50)`.  
   - **Mix:** `exciter = body*0.6 + air*0.4`.  
   - **Crack EQ:** Bandpass at **2000 Hz**, Q=**1.5**; gain `2.0 + crack_amt*2.0` (2×–4×); added to exciter: `exciter_eq = exciter + bp_2k * boost_gain`.  
   - **Transient:** `Effects.hard_clip(exciter_eq, threshold_db=-2.0)`.

2. **Shell (Module B) — “FDN”**  
   - **Delays:** Four `DelayLine(10000)` instances.  
   - **Pitch:** One “fundamental” `fund_freq` (same as exciter). Detuning: **\[0, +5, -7, +12\] cents** → `pitch_mults = 2^(cents/1200)`, then `delay_lens = sample_rate / (fund_freq * pitch_mults)` (one length per delay).  
   - **Topology:** Each block:  
     - Read from all four delays (each at its own `delay_lens[i]`).  
     - Sum the four reads → `feedback_sum`, then multiply by **0.5**.  
     - LPF at `current_lpf = 2000 + input_amp*8000` (input_amp = max abs of current exciter chunk).  
     - Soft clip: `Effects.soft_clip(..., threshold_db=-1.0)`.  
     - `mix_sig = in_chunk + (loop_sig * feedback_gain)` with `feedback_gain = 0.85 + body_amt*0.11`.  
     - Write **the same** `mix_sig` to all four delay lines.  
   - **Block size:** 32 samples.  
   - So the structure is: four parallel comb-like branches (each with a different delay length), outputs summed and then filtered/limited and fed back. There is **no** N×N feedback matrix; every delay gets the same input. That differs from a classical FDN but still gives modal-style resonances.

3. **Wires (Module D)**  
   - `noise = torch.randn_like(t)`, bandpass at **3000 Hz**, Q=**0.5**, envelope `exp(-t / (0.2 + wire_amt*0.3))`, then scaled by `wire_amt`.  
   - Added to shell output: `mix = shell_out + wires_out`.

4. **Master**  
   - Highpass at **80 Hz**.  
   - Downsample by **2×** (snare uses 2× oversampling, so internal SR = 96 kHz).  
   - Peak-normalize to 0.95.

### 3.3 Snare Hard-Coded Parameters

| Location | Value | Meaning |
|----------|--------|---------|
| Exciter | `150.0`, `150.0` | `fund_freq = 150 + tone*150` (Hz). |
| Exciter | `20`, `50` | Body decay `exp(-t*20)`; air decay `exp(-t*50)`. |
| Exciter | `0.6`, `0.4` | Body/air mix. |
| Exciter | `2000.0`, `1.5` | Crack BP center (Hz), Q. |
| Exciter | `2.0`, `2.0` | Crack gain = `2.0 + crack_amt*2.0`. |
| Exciter | `-2.0` | Hard-clip threshold (dB). |
| Shell | `10000` | Max delay length (samples) per line. |
| Shell | `[0, 5, -7, 12]` | Detune cents for the four modes. |
| Shell | `0.5` | Feedback sum scaling after summing four reads. |
| Shell | `2000.0`, `8000.0` | LPF = `2000 + input_amp*8000` (Hz). |
| Shell | `0.85`, `0.11` | `feedback_gain = 0.85 + body_amt*0.11`. |
| Shell | `-1.0` | Soft-clip threshold (dB) in loop. |
| Shell | `32` | Block size (samples). |
| Shell | `8000.0` | `loop_lpf_cutoff` is assigned but **never used**; `current_lpf` is used instead. |
| Wires | `3000.0`, `0.5` | BP center (Hz), Q. |
| Wires | `0.2`, `0.3` | Wire decay time = `0.2 + wire_amt*0.3`. |
| Master | `80.0` | Highpass cutoff (Hz). |
| Master | `oversample_factor = 2` | Internal SR = 96 kHz. |
| Master | `0.95` | Normalization peak. |

### 3.4 Snare Assumptions & Risks

- **Stateless biquads in the loop:** The LPF in the shell feedback uses `Filter.lowpass(...)` (torchaudio biquad) on **32-sample chunks** with no held state between blocks. The in-code comments warn that this can cause **clicks and spectral discontinuities** at block boundaries. A stateful one-pole (or properly stateful biquad) per loop is the intended fix.
- **“FDN” without matrix:** Standard FDN uses a feedback matrix (e.g. Hadamard) so each delay receives a mix of the others. Here, all four delays are fed the same `mix_sig`. The design is closer to “four parallel comb filters with a shared feedback path.” It can still sound modal but may ring or color differently than a full FDN.
- **Oscillator.triangle type:** `Oscillator.triangle` is called with `fund_freq` (a Python float). The signature in `oscillators.py` types the first argument as `torch.Tensor`. The math works for a scalar, but the type hint is wrong and could hide bugs if a tensor with wrong shape is passed later.
- **Dynamic LPF vs spec:** The PRD says “Map Env to Loop **High-Pass** Filter”; the code uses a **low-pass** modulated by input amplitude. The comments record the ambiguity; the current choice is “LPF for brightness.”
- **Unused `loop_lpf_cutoff`:** The variable `loop_lpf_cutoff = 8000.0` is set but never used. Either it should drive the loop LPF or be removed to avoid confusion.

---

## 4. Hi-Hat

### 4.1 Intended Design

- **Architecture:** PRD §5.3 “Metallic Sheen”: Metal (resonator bank + optional ring mod) + Air (high-passed pink noise) + Chick (stick).  
- **Parameter mapping:** Tightness → decay; Sheen → resonator Q/gain; Dirt → **not** bitcrush per PRD (“NOT Bitcrush”); Color → darkness/brightness.

### 4.2 Actual Signal Path

1. **Layer A (Metal)**  
   - Base: `base_hz = 300 + color*200` (300–500 Hz).  
   - Six oscillators: frequencies `base_hz * ratios` with  
     `ratios = [1.0, 1.5, 1.6, 1.8, 2.2, 3.2] * (1 + rand(6)*0.1)` (different each `render` if seed changes).  
   - Waveform: `sign(sin(2π f t + phase))` (square), random phase per oscillator.  
   - No ring mod in the sum; oscillators are simply summed.  
   - Three bandpasses in parallel: **6 kHz** Q=3, **9 kHz** Q=4, **12 kHz** Q=5.  
   - `layer_a = (bp1 + bp2 + bp3) * 0.5`.

2. **Layer B (Air)**  
   - **White** noise `torch.randn(len(t))`, then highpass at **7000 Hz**.  
   - Gain: `(sheen*0.5 + 0.2)`.  
   - The PRD specifies **pink** noise; the code uses white + HPF. The `Noise.pink` helper exists in `engine/dsp/noise.py` but is not used here.

3. **Layer C (Chick)**  
   - First **2 ms** of buffer filled with `torch.randn(click_dur)`, rest zero.  
   - Highpass at **4000 Hz**, then multiplied by **0.5**.  
   - Added to metal and air.

4. **Envelope**  
   - Decay time: `decay = 0.8 - tightness*0.76` (so ≈0.04 s at tightness=1, ≈0.8 s at tightness=0).  
   - Envelope: `exp(-t / decay)`.  
   - Applied to `mix = layer_a + layer_b + layer_c` **after** summing.

5. **Post**  
   - Highpass at `3000 + color*1000` Hz.  
   - **If dirt &gt; 0:** “Bitcrush” by reducing sample rate: `target_crush = 48000 - dirt*36000` (down to 12 kHz), `factor = int(sample_rate / target_crush)`, then a zero-order-hold style loop over `mix` (every `factor` samples, value is held). This is applied at **oversampled** rate (e.g. 192 kHz), so `factor` can be large and the loop can be expensive.  
   - Saturation: `mix = mix * (1 + dirt)` then `tanh(mix)`.  
   - Anti-alias LPF at `target_sr/2 - 1000`, downsample by 4×.  
   - Peak-normalize to 0.95.

### 4.4 Hi-Hat Hard-Coded Parameters

| Location | Value | Meaning |
|----------|--------|---------|
| Metal | `300.0`, `200.0` | `base_hz = 300 + color*200`. |
| Metal | `[1.0, 1.5, 1.6, 1.8, 2.2, 3.2]` | Inharmonic ratios (before jitter). |
| Metal | `0.1` | Ratio jitter: `(1 + rand(6)*0.1)`. |
| Metal | `6000`, `9000`, `12000` | BP centers (Hz); Q 3, 4, 5. |
| Metal | `0.5` | `(bp1+bp2+bp3)*0.5`. |
| Air | `7000.0` | HPF cutoff (Hz). |
| Air | `0.5`, `0.2` | Gain = `sheen*0.5 + 0.2`. |
| Chick | `0.002` | Click duration (s). |
| Chick | `4000.0` | HPF cutoff (Hz). |
| Chick | `0.5` | Chick gain. |
| Envelope | `0.8`, `0.76` | `decay = 0.8 - tightness*0.76`. |
| Post | `3000.0`, `1000.0` | HPF = `3000 + color*1000`. |
| Post | `48000.0`, `36000.0` | Bitcrush target SR = `48000 - dirt*36000`. |
| Post | `1.0` (in `1 + dirt`) | Pre-saturation gain. |
| Post | `target_sr/2 - 1000` | LPF before downsample. |
| Post | `oversample_factor = 4` | Internal SR = 192 kHz. |
| Post | `0.95` | Normalization peak. |

### 4.5 Hi-Hat Assumptions & Risks

- **Dirt uses bitcrush:** The PRD says Dirt should be “Wavefold / Saturation” and explicitly **“NOT Bitcrush”**. The current Dirt path is a sample-rate reduction (bitcrush-style) when `dirt > 0`. That is at odds with the PRD and can sound harsh or alias-heavy.
- **Air is white, not pink:** Layer B is high-passed white noise. For a closer match to the PRD and to “Air,” use `Noise.pink` (or equivalent) and then HPF, or document that white+HPF is an intentional simplification.
- **Ratio jitter and determinism:** `ratios = ratios * (1 + torch.rand(6)*0.1)` is seeded by `torch.manual_seed(seed)` at the start of `render()`, so output is deterministic for a given `seed`. But the ratios change with every new seed, so “same params, different seed” can sound quite different. If the product goal is more consistent tone across seeds, consider fixed ratios or a smaller jitter.
- **Bitcrush sample rate:** `target_crush = 48000 - dirt*36000` uses the **output** 48 kHz, while the mixing buffer is at **oversampled** rate. The code then uses `factor = int(self.sample_rate / target_crush)` (e.g. 192000/12000 = 16). So the “crush” is applied in the oversampled domain; interpretation of “dirt” as “effective output sample rate” is approximate.
- **Chick length:** Chick is 2 ms of noise, then zero. Same for every hat. No tuning by tightness or style.

---

## 5. Shared DSP Primitives

### 5.1 Filters (`engine/dsp/filters.py`)

- **Filter:** Static methods call `torchaudio.functional` biquads: `lowpass_biquad`, `highpass_biquad`, `bandpass_biquad`.  
- Default Q = **0.707** where not overridden.  
- All are **stateless**: each call is independent. Using them inside a per-block loop (e.g. snare shell) without carrying state across blocks can cause discontinuities.

### 5.2 Delay (`engine/dsp/delay.py`)

- **DelayLine(max_delay_samples):** Ring buffer of length `max_delay_samples + 4096`.  
- `read_block(delay_samples, count)` returns `count` samples from the past using **linear interpolation** for fractional delay.  
- `write_block(input_block)` appends a block and advances the write pointer.  
- Standard usage: read first (from “current time minus delay”), then write current block.  
- The +4096 is a safety margin; exact wrap logic is in the implementation.

### 5.3 Effects

- **soft_clip:** `tanh(waveform) * 10^(threshold_db/20)`.  
- **hard_clip:** `clamp(waveform, -threshold, threshold)` with the same dB→linear conversion.  
- **transient_shaper:** Implemented as an attack emphasis: `waveform * (1 + punch_env)` with `punch_env = exp(-t/0.05)*amount*2`. Not used by the current kick/snare/hat render paths; reserved for a future post-chain.

---

## 6. Summary of Likely Bad-Result Sources

1. **Kick**  
   - Fixed 5 kHz FM deviation regardless of tune or click_amount.  
   - Layer B is FM “room” tone, not a dedicated knock resonator as in the PRD.  
   - All kick-layer and post constants (decays, drive, LPF) are hard-coded; only the documented param→internal mappings are user-facing.

2. **Snare**  
   - **Stateless biquad in the feedback loop** → risk of clicks and unstable/colored tone.  
   - Simplified “FDN” (same input to all delays, no matrix) → different character from a full FDN.  
   - Unused `loop_lpf_cutoff` and spec/comment mismatch on HPF vs LPF in the loop.

3. **Hi-Hat**  
   - **Dirt = bitcrush** contradicts the PRD and can sound harsh.  
   - Air is white+HPF, not pink.  
   - Ratio jitter can make “same macro, different seed” vary a lot.  
   - Bitcrush and saturation both key off `dirt`, so high dirt stacks crush and saturation.

4. **Global**  
   - No shared post-chain yet; each instrument does its own normalization and filtering.  
   - Fixed 0.5 s duration for all hits.  
   - Final peak 0.95 is hard-coded; PRD compliance (−0.8 dBFS) may require level calibration or a shared limiter.

---

## 7. Suggested Next Steps for a New Developer

1. **Kick:** Make FM deviation scale with `tune` or `click_amount` (or both), and consider adding an explicit “Knock” branch (damped sine or BP 100–250 Hz) if matching the PRD literally.  
2. **Snare:** Replace the per-block stateless LPF in the shell loop with a **stateful** filter (e.g. one-pole LPF with carried state), and optionally implement a proper FDN feedback matrix. Remove or use `loop_lpf_cutoff`.  
3. **Hi-Hat:** Replace bitcrush-based Dirt with saturation/wavefold only, and switch Layer B to pink noise (e.g. `Noise.pink`) plus HPF.  
4. **All:** Collect every numeric literal used in the three engines into a single “constants” or “defaults” module (or tables in this spec), and consider making at least the normalization target and duration configurable (e.g. via `RenderContext` or engine constructor).  
5. **Tests:** Add or extend tests that check peak level, duration, and (where possible) determinism and basic spectral shape so refactors don’t silently change character.

---

*Document version: 1.0 — reflects codebase as of the last review (engine/instruments and engine/dsp as described above).*
