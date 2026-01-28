# Envelope Controls Implementation Summary

## Overview

Implemented Kick 2-style visible envelope controls for the Neuro-Percussion UI. Each drum (kick, snare, hat) now has a dedicated envelope strip with grouped controls, units, and real-time preview.

## What Was Implemented

### 1. Parameter Specification System (`frontend/src/audio/params/`)

- **Types** (`types.ts`): TypeScript definitions for `ParamUnit`, `ParamSpec`, `EnvelopeSpec`, `DrumParamSpec`
- **Ranges** (`ranges.ts`): Validation and formatting utilities
- **Specs** (`spec_kick.ts`, `spec_snare.ts`, `spec_hat.ts`): Envelope parameter definitions per instrument

### 2. UI Components (`frontend/src/components/`)

- **EnvelopeStrip** (`envelopes/EnvelopeStrip.tsx`): Main container with segmented tabs for envelope groups
- **EnvelopePanel** (`envelopes/EnvelopePanel.tsx`): Panel showing graph + sliders for one envelope
- **EnvelopeGraph** (`envelopes/EnvelopeGraph.tsx`): SVG-based envelope visualization (AD/AHD modes)
- **ParamSlider** (`params/ParamSlider.tsx`): Enhanced slider with unit display and formatting
- **ParamToggle** (`params/ParamToggle.tsx`): Boolean toggle control

### 3. Parameter Mapping (`frontend/src/audio/mapping/`)

- **mapKickParams.ts**: Converts Kick envelope UI params → backend nested format
- **mapSnareParams.ts**: Converts Snare envelope UI params → backend nested format
- **mapHatParams.ts**: Converts Hat envelope UI params → backend nested format

### 4. Integration (`frontend/src/components/AuditionView.tsx`)

- Added `EnvelopeStrip` component below waveform viewer
- Real-time preview with 300ms debounce
- Merges envelope params with macro params before API calls
- Saves envelope params with kit state

## Envelope Groups Per Instrument

### Kick
- **AMP** (AHD): Attack, Hold, Decay, Curve
- **PITCH** (AD): Start Pitch, Pitch Decay, Pitch Curve, End Pitch Offset
- **CLICK** (AD): Click Amount, Click Attack, Click Decay, Click Tone, Snap

### Snare
- **AMP** (AD): Attack, Decay, Curve
- **BODY** (AD): Body Pitch, Body Decay, Body Amount
- **NOISE** (AD): Noise Amount, Noise Decay, Noise Color, Noise Band Center, Noise Band Q
- **SNAP** (AD): Snap Amount, Snap Decay, Snap Tone

### Hat
- **AMP** (AD): Attack, Decay, Curve, Choke
- **METAL** (NONE): Metal Amount, Inharmonicity, Brightness
- **NOISE** (NONE): Noise Amount, Noise Color, HP Cutoff
- **STEREO** (NONE): Width, MicroDelay, Air

## Parameter Mapping Details

### Kick Mapping
- `attack_ms` → `kick.sub.amp.attack_ms`
- `decay_ms` → `kick.sub.amp.decay_ms`
- `start_pitch_st` → `kick.pitch_env.semitones`
- `pitch_decay_ms` → `kick.pitch_env.decay_ms`
- `click_amount_pct` → `kick.click.gain_db` (perceptual curve: -24dB to 0dB) + `click_amount` macro
- `click_decay_ms` → `kick.click.amp.decay_ms`
- `snap` → `click_snap` macro

### Snare Mapping
- `attack_ms` → `snare.shell.amp.attack_ms`
- `decay_ms` → `snare.shell.amp.decay_ms`
- `body_pitch_hz` → `snare.shell.pitch_hz`
- `body_decay_ms` → `snare.shell.amp.decay_ms`
- `noise_amount_pct` → `snare.wires.gain_db` (-18dB to +3dB) + `wire` macro
- `noise_decay_ms` → `snare.wires.amp.decay_ms`
- `snap_amount_pct` → `snare.exciter_body.gain_db` + `crack` macro

### Hat Mapping
- `attack_ms` → `hat.metal.amp.attack_ms`
- `decay_ms` → `hat.metal.amp.decay_ms`
- `choke` → `hat.choke_group` (boolean)
- `metal_amount_pct` → `hat.metal.gain_db`
- `noise_amount_pct` → `hat.air.gain_db` + `sheen` macro
- `hpf_cutoff_hz` → `hat.hpf_hz`

## Real-Time Preview

- Envelope param changes trigger audio regeneration after 300ms debounce
- Macro param changes also trigger preview (existing behavior)
- Both param types are merged before API call

## Backward Compatibility

- Existing patches without `envelopeParams` will default to spec defaults
- Macro params continue to work as before
- Kit export includes both `params` (macros) and `envelopeParams` (envelopes)

## Testing

- Unit tests in `frontend/src/audio/mapping/__tests__/mapping.test.ts`
- Tests verify mapping functions produce correct backend param structure
- TypeScript compilation verified (no errors)

## Usage

1. Select an instrument (kick/snare/hat)
2. Envelope strip appears below waveform viewer
3. Click envelope tabs (AMP, PITCH, CLICK, etc.) to switch groups
4. Adjust sliders - audio regenerates automatically after 300ms
5. Use Reset button (↻) to restore envelope defaults
6. Envelope params are saved with kit when clicking "+" button

## Future Enhancements

- Draggable envelope graph points (currently visual only)
- Link toggle for coupling envelope times
- Preset system for envelope configurations
- Advanced envelope modes (AHDSR, etc.)
