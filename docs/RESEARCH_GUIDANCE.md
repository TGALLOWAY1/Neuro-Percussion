# RESEARCH_GUIDANCE.md
status: **CANONICAL SOURCE OF TRUTH**
schema_version: **1**
last_updated: **2026-01-28**

This document is the **single source of truth** for:
- The **canonical patch schema** for Kick/Snare/Hi‑Hat
- The **complete set of allowed parameters** (IDs, units, ranges, defaults)
- **UI control rendering** (only params defined here may appear in the UI)
- **Mapping** (Patch → EngineParams) and backend **DSP gating rules**
- **Conformance tests** (the codebase must self-check against this file)

> If a parameter/control exists in the UI or patch objects but is **not defined here**, it is **deprecated** and must be removed or explicitly added here as `experimental`.

---

## Normative rules (MUST)

1) **Allowed parameters**
- The UI MUST render **only** parameters defined in this file (except `experimental: true`).
- Patch JSON MUST NOT persist unknown keys.
- Mapping MUST NOT accept unknown keys.

2) **Single pipeline**
- There MUST be exactly one parameter pipeline:
  `StoredPatch -> migrateToCanonical() -> CanonicalPatch -> mapToEngineParams() -> EngineParams -> DSP`
- No “merge of old + new params” is allowed outside `migrateToCanonical()`.

3) **No double-application**
- Legacy macros MUST NOT be applied after migration.
- EngineParams MUST be applied exactly once per render/trigger.

4) **Units**
- Units are strict. Any normalized value must be explicitly labeled as `unit: linear_0_1` and have a conversion note.
- All unit conversions (ms↔s, st↔ratio, dB↔linear) MUST be centralized.

5) **DSP gating**
- If an FX block is disabled (`enabled=false`), DSP MUST **skip compute**, not just set mix=0.
- One-shot modes MUST have **no repeats** (feedback = 0 and delay/FDN bypassed).

---

## Global conventions

### Units
- `ms` (milliseconds)
- `hz` (Hertz)
- `st` (semitones)
- `db` (decibels)
- `linear_0_1` (unitless normalized, 0..1)
- `ratio` (e.g., compression ratio like 3:1)
- `bool` (true/false)

### Parameter record (required fields)
Every parameter MUST specify:
- `id` (stable string)
- `label` (UI label)
- `unit`
- `min`, `max`, `default`
- `role` (transient/body/noise/mix/fx/qc)
- `description` (short)
Optional:
- `notes`
- `experimental: true`
- `deprecated: true` + `replaced_by`

---

# Canonical patch schema (CANONICAL)

## CanonicalPatch (schema_version=1)
```ts
type CanonicalPatch = {
  schema_version: 1;
  kick: KickPatch;
  snare: SnarePatch;
  hat: HatPatch;
};
```

### Shared FX / behavior fields (where applicable)
- `*.fx.room.enabled` (bool, default false)
- `snare.behavior.repeat_mode` (enum: oneshot|echo|roll; default oneshot)
- `hat.behavior.choke_group` (bool, default true)

---

# Deprecated parameters (MUST REMOVE)

If your UI/code contains any of these, remove them or map them during migration then delete:
- (Add legacy IDs/names here as you discover them via audit)
- Example format:
  - `legacy.snare.delayMix` -> replaced_by: `snare.fx.delay.mix` (if you truly keep delay)
  - `snare.punchDecay` -> replaced_by: `snare.body.tone_decay_ms`

> IMPORTANT: If the UI currently shows a control that “does nothing,” it is either missing mapping or should be listed here as deprecated.

---

# Parameters — Kick / Snare / Hi‑Hat (CANONICAL)

## Kick (Hybrid Subtractive/FM Layering)

### Kick transient layer (0–25ms impact)
| id | label | unit | min | max | default | role | description | notes |
|---|---|---|---:|---:|---:|---|---|---|
| kick.transient.level | Click Level | linear_0_1 | 0.0 | 1.0 | 0.5 | transient | Mix volume of transient layer vs body. | |
| kick.transient.attack_ms | Attack (Snap) | ms | 0 | 5 | 0.5 | transient | Attack length; higher = more snap/pop. | Typically near-instant for digital drums. |
| kick.transient.filter_hz | Click Filter | hz | 200 | 16000 | 6500 | transient | HP/BP cutoff/center controlling brightness/hardness. | Higher=tighter/plastic; lower=thuddy/woody. |
| kick.transient.hardness | Hardness | linear_0_1 | 0.0 | 1.0 | 0.6 | transient | Saturation/shaping on transient emphasizing ~5–8kHz. | |

### Kick body layer (sub + thump)
| id | label | unit | min | max | default | role | description | notes |
|---|---|---|---:|---:|---:|---|---|---|
| kick.body.fund_hz | Pitch (Fund.) | hz | 40 | 150 | 55 | body | Resting fundamental frequency. | <50Hz deep/trap; >100Hz punchy. |
| kick.body.pitch_env_amount_st | Pitch Env Amount | st | 0 | 100 | 24 | body | Pitch drop amount from start to fundamental. | Higher=punchier/aggressive. |
| kick.body.pitch_env_decay_ms | Pitch Decay | ms | 10 | 300 | 50 | body | Time for pitch to drop to fundamental. | <30ms click/thump; >100ms laser. |
| kick.body.amp_decay_ms | Amp Decay | ms | 150 | 800 | 350 | body | Body tail length. | Short=tight; long=808 boom. |
| kick.body.drive_fold | Drive/Fold | linear_0_1 | 0.0 | 1.0 | 0.0 | body | Wavefolding/soft clip on body for harmonics. | Requires oversampling guardrail. |

### Kick global / mix shaping
| id | label | unit | min | max | default | role | description | notes |
|---|---|---|---:|---:|---:|---|---|---|
| kick.mix.eq_scoop_center_hz | EQ Scoop Center | hz | 200 | 400 | 300 | mix | Center freq for boxiness scoop. | Apply -3 to -9 dB typical. |
| kick.mix.global_attack_ms | Attack (Global) | ms | 0 | 10 | 0 | mix | Global amp attack time. | 2–5ms softens onset. |
| kick.mix.compression_ratio | Compression Ratio | ratio | 1.0 | 4.0 | 3.0 | mix | Compression for consistency. | Suggested: attack 5ms, release 200ms. |

---

## Snare (Dual-Layer Subtractive + FM)

### Snare body (head)
| id | label | unit | min | max | default | role | description | notes |
|---|---|---|---:|---:|---:|---|---|---|
| snare.body.tune_hz | Tune (Fund.) | hz | 120 | 250 | 200 | body | Main tonal note of snare head. | <150 fat; >220 tight/D&B. |
| snare.body.tone_decay_ms | Tone Decay | ms | 50 | 400 | 150 | body | Length of tonal ring. | Too long = muddy. |
| snare.body.pitch_env_st | Pitch Env | st | 0 | 24 | 12 | body | Initial pitch drop of body. | High=tom/laser. |

### Snare wires (noise)
| id | label | unit | min | max | default | role | description | notes |
|---|---|---|---:|---:|---:|---|---|---|
| snare.noise.level | Snare Level | linear_0_1 | 0.0 | 1.0 | 0.6 | noise | Balance of wire noise vs body. | |
| snare.noise.decay_ms | Noise Decay | ms | 100 | 600 | 250 | noise | Length of wire fizz. | Often slightly longer than tone decay. |
| snare.noise.hp_hz | Wire Filter (HP) | hz | 1000 | 10000 | 5000 | noise | High-pass cutoff controlling wire brightness. | Lower=loose/trashy; higher=tight/crisp. |

### Snare global shaping
| id | label | unit | min | max | default | role | description | notes |
|---|---|---|---:|---:|---:|---|---|---|
| snare.mix.snap_attack_ms | Snap/Attack | ms | 0 | 10 | 1 | transient | Amp attack. | Keep near 0 for punch. |
| snare.mix.hardness | Hardness | linear_0_1 | 0.0 | 1.0 | 0.5 | mix | Saturation adding upper harmonics (~5–8kHz). | |
| snare.mix.box_cut_db | EQ Box Cut | db | -15 | 0 | -6 | mix | Notch cut @ 400–600Hz to remove cardboard. | Target -3 to -9 dB typical. |

### Snare behavior / gating (CANONICAL)
| id | label | unit | min | max | default | role | description | notes |
|---|---|---|---|---|---|---|---|---|
| snare.behavior.repeat_mode | Repeat Mode | enum | oneshot | roll | oneshot | behavior | One-shot vs roll/echo behaviors. | In oneshot: feedback MUST be 0 and bypassed. |
| snare.fx.room.enabled | Room Enabled | bool | false | true | false | fx | Enables room layer (short ambience). | If false: room compute must be skipped. |

> If you implement snare delay/FDN/echo, it must be expressed as explicit params under `snare.fx.delay.*` with defaults OFF. Do not hide it behind room or other macros.

---

## Hi‑Hat (Inharmonic Additive / FM)

### Hat core tone (inharmonic partials)
| id | label | unit | min | max | default | role | description | notes |
|---|---|---|---:|---:|---:|---|---|---|
| hat.core.metal_pitch_hz | Metal Pitch | hz | 300 | 10000 | 800 | core | Base frequency for oscillator bank. | Affects “size”. |
| hat.core.dissonance | Dissonance | linear_0_1 | 0.0 | 1.0 | 0.7 | core | Detune/spread controlling inharmonicity. | 0=tonal; 1=noise-like. |
| hat.core.fm_amount | FM Amount | linear_0_1 | 0.0 | 1.0 | 0.5 | core | Cross-mod depth adding grit/sidebands. | |

### Hat filtering
| id | label | unit | min | max | default | role | description | notes |
|---|---|---|---:|---:|---:|---|---|---|
| hat.filter.hp_hz | High-Pass | hz | 300 | 8000 | 3000 | filter | HP cutoff to remove body/mud. | 808 hats: little below 3kHz. |
| hat.filter.color_center_hz | Color (BP Center) | hz | 2000 | 15000 | 8000 | filter | BP center shifting resonant peak. | Low=clank; high=sizzle. |

### Hat envelope + behavior
| id | label | unit | min | max | default | role | description | notes |
|---|---|---|---:|---:|---:|---|---|---|
| hat.env.decay_ms | Decay | ms | 20 | 2000 | 80 | env | Critical articulation control. | <100ms closed; >400ms open/crash. |
| hat.behavior.choke_group | Choke Group | bool | false | true | true | behavior | Closed hat cuts open tail (monophonic). | MUST be ON by default. |

---

# Gating rules (MUST)

## One-shot repeat suppression
- If `snare.behavior.repeat_mode == oneshot`:
  - Any delay/FDN/feedback blocks MUST have `feedback_gain = 0`
  - Repeat-capable blocks MUST be bypassed (no compute)

## Room compute must be skipped
- If `*.fx.room.enabled == false`:
  - Room/ambience branch MUST not be computed

## Hat choke group
- If `hat.behavior.choke_group == true`:
  - Triggering “closed hat” MUST immediately stop any open-hat tail

---

# QC Targets (SHOULD)

## Peak & headroom
- Final normalized peak target: **-1 dBFS to -0.1 dBFS**
- Recommended compression ratio for consistency: **~3:1**

## Spectral targets
- Kick: energy at **40–60Hz** and **60–150Hz**
- Snare: body **150–250Hz**, cut **300–600Hz** by **3–9dB**, crack boost **5–8kHz**
- Hats: HP above **3000Hz** typical

## Transient & pitch behavior
- Click/snap transient: **0–25ms**
- Kick should stabilize at constant fundamental for **100–300ms** after pitch drop

---

# DSP Guardrails (MUST where applicable)

- Distortion (Drive/Fold/Hardness): apply **2x/4x oversampling** or equivalent anti-aliasing.
- Oscillator phase reset on trigger (avoid phase cancellation when layering).
- Avoid linear-phase filters on low-end transients (prevent pre-ringing).

---

# Conformance checklist for the codebase (MUST)

The codebase must include automated checks that verify:
1) Every UI control corresponds to a parameter ID defined above.
2) Every parameter ID defined above is:
   - stored in CanonicalPatch
   - mapped to EngineParams
   - used by DSP (or explicitly marked `experimental`)
3) No legacy parameters are applied after migration.
4) Gating rules are honored (skip compute when disabled; oneshot suppresses feedback).
5) Units are consistent and clamped at every boundary.

---

# Preset guidance (OPTIONAL)

Presets may be defined as patch JSON using only the canonical IDs above.
- Kick: deep_808, punchy_house, tight_techno, hybrid_knock
- Snare: tight_pop, trap, dnb, gritty_electro
- Hat: closed_808, open_hat, crisp_modern, gritty_lofi
