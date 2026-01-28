# Parameter Reference

Complete reference for all parameters used by the Neuro-Percussion engine.

## Parameter Hierarchy

1. **Macro params** (top-level, used by proposer/ML): Simple 0-1 knobs
2. **Spec params** (`{instrument}.spec.*`): Human-friendly mix-ready controls
3. **Advanced params** (`{instrument}.{layer}.*`): Per-layer gains, ADSR, filters
4. **Defaults** (`DEFAULT_PRESET`): Fallback values when params not provided

**Priority**: User-provided advanced > Macro-implied advanced > Spec-implied advanced > Defaults

## Kick Drum

### Layers
- **sub**: Low-frequency body (fundamental pitch)
- **click**: High-frequency transient (filtered noise burst or FM-derived)
- **knock**: Damped sine (110-240 Hz, speaker knock)
- **room**: Delayed FM layer (room tone)

### Macro Parameters (PARAM_SPACES)
- `punch_decay` (0.15-0.9): Sub layer decay time
- `click_amount` (0.0-0.85): Click intensity and FM modulation
- `click_snap` (0.0-0.85): Click snap/transient sharpness
- `tune` (30-80 Hz): Fundamental pitch
- `room_tone_freq` (80-250 Hz): Room layer tone frequency
- `room_air` (0.0-0.8): Room layer FM air/noise amount
- `distance_ms` (5-40 ms): Room layer delay time
- `blend` (0.1-0.7): Room layer mix level

### Spec Parameters (`kick.spec.*`)
- `pitch_hz` (40-150 Hz, default 55): Fundamental pitch
- `pitch_env_semitones` (0-100, default 24): Pitch envelope depth
- `pitch_decay_ms` (10-300 ms, default 50): Pitch envelope decay
- `amp_decay_ms` (150-800 ms, default 350): Body amplitude decay
- `click_level` (0-1, default 0.5): Click loudness
- `click_attack_ms` (0-5 ms, default 0.5): Click attack time
- `click_filter_hz` (200-16000 Hz, default 7000): Click HPF cutoff
- `hardness` (0-1, default 0.6): Transient saturation amount
- `drive_fold` (0-1, default 0.0): Body harmonic drive (oversampled)
- `eq_scoop_hz` (200-400 Hz, default 300): EQ notch frequency
- `eq_scoop_db` (-9 to 0 dB, default -6): EQ notch depth
- `global_attack_ms` (0-10 ms, default 0): Global attack time
- `comp_ratio` (1-4, default 3): Compressor ratio
- `comp_attack_ms` (1-20 ms, default 5): Compressor attack
- `comp_release_ms` (50-400 ms, default 200): Compressor release

### Advanced Parameters

#### Per-Layer Gain (`kick.{layer}.gain_db`)
- `kick.sub.gain_db` (default: 0.0 dB)
- `kick.click.gain_db` (default: -6.0 dB)
- `kick.knock.gain_db` (default: -4.0 dB)
- `kick.room.gain_db` (default: -10.0 dB)

#### Per-Layer Mute (`kick.{layer}.mute`)
- `kick.sub.mute` (default: False)
- `kick.click.mute` (default: False)
- `kick.knock.mute` (default: False)
- `kick.room.mute` (default: False)

#### Per-Layer ADSR (`kick.{layer}.amp.{attack_ms,decay_ms,sustain,release_ms}`)
- `kick.sub.amp.*`: Attack=0ms, Decay=180ms, Sustain=0, Release=10ms
- `kick.click.amp.*`: Attack=0ms, Decay=6ms, Sustain=0, Release=5ms
- `kick.knock.amp.*`: Attack=0ms, Decay=120ms, Sustain=0, Release=15ms
- `kick.room.amp.*`: Attack=0ms, Decay=300ms, Sustain=0, Release=20ms

#### Pitch Envelope (`kick.pitch_env.*`)
- `kick.pitch_env.semitones` (default: 24): Pitch drop depth
- `kick.pitch_env.decay_ms` (default: 50): Pitch envelope decay

#### Other Advanced
- `kick.knock.freq_norm` (0-1, default 0.5): Knock frequency (110-240 Hz normalized)
- `kick.click.filter_hz`: Click HPF cutoff (from spec)
- `kick.click.hardness`: Transient saturation (from spec)
- `kick.sub.drive_fold`: Body drive (from spec)
- `kick.eq.scoop_hz`, `kick.eq.scoop_db`: EQ notch (from spec)
- `kick.comp.ratio`, `kick.comp.attack_ms`, `kick.comp.release_ms`: Compressor (from spec)

### Defaults Location
- File: `engine/params/schema.py`
- Key: `DEFAULT_PRESET["kick"]`

---

## Snare Drum

### Layers
- **exciter_body**: Tonal triangle oscillator (transient)
- **exciter_air**: Noise burst (transient)
- **shell**: FDN with Hadamard feedback matrix (tonal body)
- **wires**: Bandpass-swept noise (9k→3.5k over 50ms)
- **room**: Lowpassed shell send (optional)

### Macro Parameters (PARAM_SPACES)
- `tone` (0.3-0.8): Shell fundamental frequency (180-300 Hz)
- `wire` (0.1-0.75): Wire rattle level and decay
- `crack` (0.1-0.7): Exciter snap/crack intensity
- `body` (0.2-0.85): Shell body depth and feedback

### Spec Parameters (`snare.spec.*`)
- `tune_hz` (120-250 Hz, default 200): Shell fundamental pitch
- `tone_decay_ms` (50-400 ms, default 150): Shell decay time
- `pitch_env_st` (0-24 semitones, default 12): Pitch envelope depth
- `snare_level` (0-1, default 0.6): Wire balance (maps to `snare.wires.gain_db`)
- `noise_decay_ms` (100-600 ms, default 250): Wire decay time
- `wire_filter_hz` (1000-10000 Hz, default 5000): Wire HPF cutoff
- `snap_attack_ms` (0-10 ms, default 1): Snap attack time
- `hardness` (0-1, default 0.5): Transient saturation amount
- `box_cut_db` (0 to -15 dB, default -6): Box cut notch depth
- `box_cut_hz` (400-600 Hz, default 500): Box cut notch frequency

### Advanced Parameters

#### Per-Layer Gain (`snare.{layer}.gain_db`)
- `snare.exciter_body.gain_db` (default: -200.0 dB, muted)
- `snare.exciter_air.gain_db` (default: -200.0 dB, muted)
- `snare.shell.gain_db` (default: 0.0 dB)
- `snare.wires.gain_db` (default: -3.0 dB)
- `snare.room.gain_db` (default: -200.0 dB, muted)

#### Per-Layer Mute (`snare.{layer}.mute`)
- `snare.exciter_body.mute` (default: True)
- `snare.exciter_air.mute` (default: True)
- `snare.shell.mute` (default: False)
- `snare.wires.mute` (default: False)
- `snare.room.mute` (default: True)

#### Per-Layer ADSR (`snare.{layer}.amp.{attack_ms,decay_ms,sustain,release_ms}`)
- `snare.exciter_body.amp.*`: Attack=0ms, Decay=50ms, Sustain=0, Release=5ms
- `snare.exciter_air.amp.*`: Attack=0ms, Decay=20ms, Sustain=0, Release=3ms
- `snare.shell.amp.*`: Attack=0ms, Decay=500ms, Sustain=1.0, Release=0ms
- `snare.wires.amp.*`: Attack=0ms, Decay=140ms, Sustain=1.0, Release=0ms
- `snare.room.amp.*`: Attack=0ms, Decay=400ms, Sustain=0, Release=0ms

#### Pitch Controls (`snare.shell.pitch_*`)
- `snare.shell.pitch_hz` (from spec `tune_hz`): Fundamental pitch
- `snare.shell.pitch_env_st` (from spec): Pitch envelope depth
- `snare.shell.pitch_decay_ms` (from spec): Pitch envelope decay

#### Other Advanced
- `snare.wires.filter_hz`: Wire HPF cutoff (from spec)
- `snare.snap.hardness`: Transient saturation (from spec)
- `snare.box_cut.hz`, `snare.box_cut.db`: Box cut notch (from spec)

### Defaults Location
- File: `engine/params/schema.py`
- Key: `DEFAULT_PRESET["snare"]`

---

## Hi-Hat

### Layers
- **metal**: Harmonic oscillator bank (6 ratios with jitter)
- **air**: Pink noise (high-passed)
- **chick**: High-frequency click transient

### Macro Parameters (PARAM_SPACES)
- `tightness` (0.1-0.95): Global decay time (tighter = shorter)
- `sheen` (0.0-0.7): Air layer intensity
- `dirt` (0.0-0.5): Dirt/saturation amount (FM analog)
- `color` (0.2-0.85): Metal layer base frequency (300-500 Hz)

### Spec Parameters (`hat.spec.*`)
- `metal_pitch_hz` (300-10000 Hz, default 800): Metal oscillator base frequency
- `dissonance` (0-1, default 0.7): Harmonic ratio jitter (maps to `hat.metal.ratio_jitter`)
- `fm_amount` (0-1, default 0.5): FM/saturation amount (maps to `dirt`)
- `hpf_hz` (300-8000 Hz, default 3000): High-pass filter cutoff
- `color_hz` (2000-15000 Hz, default 8000): Bandpass emphasis center
- `decay_ms` (20-2000 ms, default 80): Decay time (open vs closed affects this)
- `choke_group` (bool, default True): Choke group membership
- `is_open` (bool, default False): Open hat flag (affects decay/attack)
- `attack_ms` (0-10 ms, default 0): Attack time (used for open hats)

### Advanced Parameters

#### Per-Layer Gain (`hat.{layer}.gain_db`)
- `hat.metal.gain_db` (default: 0.0 dB)
- `hat.air.gain_db` (default: 0.0 dB)
- `hat.chick.gain_db` (default: 0.0 dB)

#### Per-Layer Mute (`hat.{layer}.mute`)
- `hat.metal.mute` (default: False)
- `hat.air.mute` (default: False)
- `hat.chick.mute` (default: False)

#### Per-Layer ADSR (`hat.{layer}.amp.{attack_ms,decay_ms,sustain,release_ms}`)
- `hat.metal.amp.*`: Attack=0ms, Decay=70ms (closed) / 600ms+ (open), Sustain=1.0, Release=0ms
- `hat.air.amp.*`: Attack=0ms (closed) / 5ms (open), Decay=45ms (closed) / 600ms+ (open), Sustain=1.0, Release=0ms
- `hat.chick.amp.*`: Attack=0ms, Decay=10ms, Sustain=1.0, Release=0ms

#### Other Advanced
- `hat.metal.base_hz`: Metal oscillator base frequency (from spec)
- `hat.metal.ratio_jitter`: Harmonic ratio jitter (from spec `dissonance`)
- `hat.hpf_hz`: High-pass filter cutoff (from spec)
- `hat.color_hz`: Bandpass emphasis center (from spec)
- `hat.is_open`: Open hat flag (from spec)
- `hat.choke_group`: Choke group membership (from spec)
- `hat.dirt.legacy_bitcrush` (bool, default False): Use legacy bitcrush instead of wavefold

### Defaults Location
- File: `engine/params/schema.py`
- Key: `DEFAULT_PRESET["hat"]`

---

## PostChain Settings

Applied to all instruments after layer mixing:

- **DC Block**: Removes DC offset (mean subtraction)
- **Transient Shaper** (optional): `params["transient_shaper"]` (0-1 amount)
- **Soft Clip**: -0.8 dBFS ceiling (tanh)
- **Boundary Fades**: 0.5 ms fade-in, 2 ms fade-out
- **Safety Clamp**: max(abs) ≤ 0.92

Location: `engine/dsp/postchain.py`

---

## QC Thresholds

Quality control thresholds (see `engine/qc/thresholds.py`):

### Kick
- Peak: -1.0 to -0.1 dBFS
- Sub ratio (20-100Hz): min 0.2
- Click ratio (2k-8kHz): min 0.01
- Aliasing proxy: max 0.5

### Snare
- Peak: -1.0 to -0.1 dBFS
- Body ratio (150-250Hz): min 0.01
- Boxiness ratio (300-600Hz): max 0.15
- Crack ratio (5k-8kHz): min 0.01
- Aliasing proxy: max 0.5
- Ringing proxy: max 0.3

### Hat
- Peak: -1.0 to -0.1 dBFS
- Energy below 3kHz: max 10%
- Aliasing proxy: max 0.5

---

## Parameter Resolution Flow

1. **Input params** → User-provided dict
2. **Spec mapping** → If `{instrument}.spec.*` exists, map to advanced params
3. **Clamp** (if `mode=realistic`) → Apply realistic mode clamps
4. **Resolve** → Deep-merge with `DEFAULT_PRESET[instrument]`
5. **Macro mapping** → If macros exist, compute implied advanced params
6. **Safe merge** → Merge implied params (user advanced params win)
7. **Engine render** → Use resolved params
8. **PostChain** → Apply DC block, fades, soft clip, clamp
9. **Export** → Convert to WAV bytes

Location: `engine/params/resolve.py`
