"""
Parameter schema and defaults for UI visibility.
Exposes ADSR and per-layer faders while keeping PARAM_SPACES macro-only for ML.
"""
from typing import Dict, Any, Literal

# Type definitions
ParamType = Literal["float", "int", "bool"]
ParamGroup = Literal["macro", "layer_gain", "layer_adsr", "advanced"]

# Schema entry structure: type, default, min, max, group, description
ParamSchemaEntry = Dict[str, Any]


def _make_param(
    param_type: ParamType,
    default: Any,
    min_val: float,
    max_val: float,
    group: ParamGroup,
    description: str,
) -> ParamSchemaEntry:
    """Helper to create a schema entry."""
    return {
        "type": param_type,
        "default": default,
        "min": min_val,
        "max": max_val,
        "group": group,
        "description": description,
    }


# -----------------------------------------------------------------------------
# PARAM_SCHEMA: Metadata for UI (type, default, min, max, group, description)
# -----------------------------------------------------------------------------

PARAM_SCHEMA: Dict[str, Dict[str, ParamSchemaEntry]] = {
    "kick": {
        # Macro params (also in PARAM_SPACES)
        "punch_decay": _make_param(
            "float", 0.5, 0.1, 1.0, "macro", "Sub layer decay time (longer = more sustain)"
        ),
        "click_amount": _make_param(
            "float", 0.5, 0.0, 1.0, "macro", "Click layer intensity and FM modulation"
        ),
        "click_snap": _make_param(
            "float", 0.5, 0.0, 1.0, "macro", "Click layer snap/transient sharpness"
        ),
        "tune": _make_param(
            "float", 45.0, 30.0, 80.0, "macro", "Fundamental pitch (Hz)"
        ),
        "room_tone_freq": _make_param(
            "float", 150.0, 50.0, 300.0, "macro", "Room layer tone frequency (Hz)"
        ),
        "room_air": _make_param(
            "float", 0.3, 0.0, 1.0, "macro", "Room layer FM air/noise amount"
        ),
        "distance_ms": _make_param(
            "float", 20.0, 0.0, 50.0, "macro", "Room layer delay time (ms)"
        ),
        "blend": _make_param(
            "float", 0.3, 0.0, 1.0, "macro", "Room layer mix level"
        ),
        # Advanced: knock freq (not in PARAM_SPACES but exists)
        "kick.knock.freq_norm": _make_param(
            "float", 0.5, 0.0, 1.0, "advanced", "Knock layer frequency (110-240 Hz normalized)"
        ),
        "kick.knock.decay_ms": _make_param(
            "float", 50.0, 10.0, 200.0, "advanced", "Knock layer decay time (ms)"
        ),
        # Per-layer gain_db
        "kick.sub.gain_db": _make_param(
            "float", 0.0, -60.0, 12.0, "layer_gain", "Sub layer gain (dB)"
        ),
        "kick.sub.mute": _make_param(
            "bool", False, False, True, "layer_gain", "Sub layer mute"
        ),
        "kick.click.gain_db": _make_param(
            "float", -6.0, -60.0, 12.0, "layer_gain", "Click layer gain (dB)"
        ),
        "kick.click.mute": _make_param(
            "bool", False, False, True, "layer_gain", "Click layer mute"
        ),
        "kick.knock.gain_db": _make_param(
            "float", -4.0, -60.0, 12.0, "layer_gain", "Knock layer gain (dB)"
        ),
        "kick.knock.mute": _make_param(
            "bool", False, False, True, "layer_gain", "Knock layer mute"
        ),
        "kick.room.gain_db": _make_param(
            "float", -10.0, -60.0, 12.0, "layer_gain", "Room layer gain (dB)"
        ),
        "kick.room.mute": _make_param(
            "bool", False, False, True, "layer_gain", "Room layer mute"
        ),
        # Per-layer ADSR: sub
        "kick.sub.amp.attack_ms": _make_param(
            "float", 0.0, 0.0, 50.0, "layer_adsr", "Sub layer attack time (ms)"
        ),
        "kick.sub.amp.decay_ms": _make_param(
            "float", 180.0, 50.0, 500.0, "layer_adsr", "Sub layer decay time (ms)"
        ),
        "kick.sub.amp.sustain": _make_param(
            "float", 0.0, 0.0, 1.0, "layer_adsr", "Sub layer sustain level (0-1)"
        ),
        "kick.sub.amp.release_ms": _make_param(
            "float", 10.0, 0.0, 100.0, "layer_adsr", "Sub layer release time (ms)"
        ),
        # Per-layer ADSR: click
        "kick.click.amp.attack_ms": _make_param(
            "float", 0.0, 0.0, 20.0, "layer_adsr", "Click layer attack time (ms)"
        ),
        "kick.click.amp.decay_ms": _make_param(
            "float", 6.0, 1.0, 50.0, "layer_adsr", "Click layer decay time (ms)"
        ),
        "kick.click.amp.sustain": _make_param(
            "float", 0.0, 0.0, 1.0, "layer_adsr", "Click layer sustain level (0-1)"
        ),
        "kick.click.amp.release_ms": _make_param(
            "float", 5.0, 0.0, 50.0, "layer_adsr", "Click layer release time (ms)"
        ),
        # Per-layer ADSR: knock
        "kick.knock.amp.attack_ms": _make_param(
            "float", 0.0, 0.0, 30.0, "layer_adsr", "Knock layer attack time (ms)"
        ),
        "kick.knock.amp.decay_ms": _make_param(
            "float", 120.0, 20.0, 300.0, "layer_adsr", "Knock layer decay time (ms)"
        ),
        "kick.knock.amp.sustain": _make_param(
            "float", 0.0, 0.0, 1.0, "layer_adsr", "Knock layer sustain level (0-1)"
        ),
        "kick.knock.amp.release_ms": _make_param(
            "float", 15.0, 0.0, 100.0, "layer_adsr", "Knock layer release time (ms)"
        ),
        # Per-layer ADSR: room
        "kick.room.amp.attack_ms": _make_param(
            "float", 0.0, 0.0, 100.0, "layer_adsr", "Room layer attack time (ms)"
        ),
        "kick.room.amp.decay_ms": _make_param(
            "float", 300.0, 100.0, 500.0, "layer_adsr", "Room layer decay time (ms)"
        ),
        "kick.room.amp.sustain": _make_param(
            "float", 0.0, 0.0, 1.0, "layer_adsr", "Room layer sustain level (0-1)"
        ),
        "kick.room.amp.release_ms": _make_param(
            "float", 20.0, 0.0, 150.0, "layer_adsr", "Room layer release time (ms)"
        ),
    },
    "snare": {
        # Macro params (also in PARAM_SPACES)
        "tone": _make_param(
            "float", 0.5, 0.0, 1.0, "macro", "Shell fundamental frequency (180-300 Hz)"
        ),
        "wire": _make_param(
            "float", 0.4, 0.0, 1.0, "macro", "Wire rattle level and decay"
        ),
        "crack": _make_param(
            "float", 0.5, 0.0, 1.0, "macro", "Exciter snap/crack intensity"
        ),
        "body": _make_param(
            "float", 0.5, 0.0, 1.0, "macro", "Shell body depth and feedback"
        ),
        # Per-layer gain_db
        "snare.exciter_body.gain_db": _make_param(
            "float", -200.0, -200.0, 12.0, "layer_gain", "Exciter body layer gain (dB, default muted)"
        ),
        "snare.exciter_body.mute": _make_param(
            "bool", True, False, True, "layer_gain", "Exciter body layer mute"
        ),
        "snare.exciter_air.gain_db": _make_param(
            "float", -200.0, -200.0, 12.0, "layer_gain", "Exciter air layer gain (dB, default muted)"
        ),
        "snare.exciter_air.mute": _make_param(
            "bool", True, False, True, "layer_gain", "Exciter air layer mute"
        ),
        "snare.shell.gain_db": _make_param(
            "float", 0.0, -60.0, 12.0, "layer_gain", "Shell layer gain (dB)"
        ),
        "snare.shell.mute": _make_param(
            "bool", False, False, True, "layer_gain", "Shell layer mute"
        ),
        "snare.wires.gain_db": _make_param(
            "float", -3.0, -60.0, 12.0, "layer_gain", "Wires layer gain (dB, slightly below shell)"
        ),
        "snare.wires.mute": _make_param(
            "bool", False, False, True, "layer_gain", "Wires layer mute"
        ),
        "snare.room.gain_db": _make_param(
            "float", -200.0, -200.0, 12.0, "layer_gain", "Room layer gain (dB, default muted)"
        ),
        "snare.room.mute": _make_param(
            "bool", True, False, True, "layer_gain", "Room layer mute"
        ),
        # Per-layer ADSR: exciter_body
        "snare.exciter_body.amp.attack_ms": _make_param(
            "float", 0.0, 0.0, 10.0, "layer_adsr", "Exciter body attack time (ms)"
        ),
        "snare.exciter_body.amp.decay_ms": _make_param(
            "float", 50.0, 10.0, 100.0, "layer_adsr", "Exciter body decay time (ms, very short)"
        ),
        "snare.exciter_body.amp.sustain": _make_param(
            "float", 0.0, 0.0, 1.0, "layer_adsr", "Exciter body sustain level (0-1)"
        ),
        "snare.exciter_body.amp.release_ms": _make_param(
            "float", 5.0, 0.0, 50.0, "layer_adsr", "Exciter body release time (ms)"
        ),
        # Per-layer ADSR: exciter_air
        "snare.exciter_air.amp.attack_ms": _make_param(
            "float", 0.0, 0.0, 10.0, "layer_adsr", "Exciter air attack time (ms)"
        ),
        "snare.exciter_air.amp.decay_ms": _make_param(
            "float", 20.0, 5.0, 50.0, "layer_adsr", "Exciter air decay time (ms, very short)"
        ),
        "snare.exciter_air.amp.sustain": _make_param(
            "float", 0.0, 0.0, 1.0, "layer_adsr", "Exciter air sustain level (0-1)"
        ),
        "snare.exciter_air.amp.release_ms": _make_param(
            "float", 3.0, 0.0, 30.0, "layer_adsr", "Exciter air release time (ms)"
        ),
        # Per-layer ADSR: shell
        "snare.shell.amp.attack_ms": _make_param(
            "float", 0.0, 0.0, 50.0, "layer_adsr", "Shell attack time (ms)"
        ),
        "snare.shell.amp.decay_ms": _make_param(
            "float", 500.0, 200.0, 500.0, "layer_adsr", "Shell decay time (ms, moderate/flat)"
        ),
        "snare.shell.amp.sustain": _make_param(
            "float", 1.0, 0.0, 1.0, "layer_adsr", "Shell sustain level (0-1, flat)"
        ),
        "snare.shell.amp.release_ms": _make_param(
            "float", 0.0, 0.0, 100.0, "layer_adsr", "Shell release time (ms)"
        ),
        # Per-layer ADSR: wires
        "snare.wires.amp.attack_ms": _make_param(
            "float", 0.0, 0.0, 50.0, "layer_adsr", "Wires attack time (ms)"
        ),
        "snare.wires.amp.decay_ms": _make_param(
            "float", 140.0, 50.0, 500.0, "layer_adsr", "Wires decay time (ms)"
        ),
        "snare.wires.amp.sustain": _make_param(
            "float", 1.0, 0.0, 1.0, "layer_adsr", "Wires sustain level (0-1, flat)"
        ),
        "snare.wires.amp.release_ms": _make_param(
            "float", 0.0, 0.0, 100.0, "layer_adsr", "Wires release time (ms)"
        ),
        # Per-layer ADSR: room
        "snare.room.amp.attack_ms": _make_param(
            "float", 0.0, 0.0, 100.0, "layer_adsr", "Room attack time (ms)"
        ),
        "snare.room.amp.decay_ms": _make_param(
            "float", 400.0, 100.0, 500.0, "layer_adsr", "Room decay time (ms)"
        ),
        "snare.room.amp.sustain": _make_param(
            "float", 0.0, 0.0, 1.0, "layer_adsr", "Room sustain level (0-1)"
        ),
        "snare.room.amp.release_ms": _make_param(
            "float", 0.0, 0.0, 150.0, "layer_adsr", "Room release time (ms)"
        ),
    },
    "hat": {
        # Macro params (also in PARAM_SPACES)
        "tightness": _make_param(
            "float", 0.5, 0.0, 1.0, "macro", "Global decay time (tighter = shorter decay)"
        ),
        "sheen": _make_param(
            "float", 0.4, 0.0, 1.0, "macro", "Air layer intensity"
        ),
        "dirt": _make_param(
            "float", 0.2, 0.0, 1.0, "macro", "Dirt/saturation amount (low by default)"
        ),
        "color": _make_param(
            "float", 0.5, 0.0, 1.0, "macro", "Metal layer base frequency (300-500 Hz)"
        ),
        # Advanced: metal ratio jitter
        "hat.metal.ratio_jitter": _make_param(
            "float", 0.1, 0.0, 0.5, "advanced", "Metal layer harmonic ratio jitter"
        ),
        # Advanced: legacy bitcrush
        "hat.dirt.legacy_bitcrush": _make_param(
            "bool", False, False, True, "advanced", "Use legacy bitcrush instead of wavefold/sat"
        ),
        # Per-layer gain_db
        "hat.metal.gain_db": _make_param(
            "float", 0.0, -60.0, 12.0, "layer_gain", "Metal layer gain (dB)"
        ),
        "hat.metal.mute": _make_param(
            "bool", False, False, True, "layer_gain", "Metal layer mute"
        ),
        "hat.air.gain_db": _make_param(
            "float", 0.0, -60.0, 12.0, "layer_gain", "Air layer gain (dB)"
        ),
        "hat.air.mute": _make_param(
            "bool", False, False, True, "layer_gain", "Air layer mute"
        ),
        "hat.chick.gain_db": _make_param(
            "float", 0.0, -60.0, 12.0, "layer_gain", "Chick layer gain (dB)"
        ),
        "hat.chick.mute": _make_param(
            "bool", False, False, True, "layer_gain", "Chick layer mute"
        ),
        # Per-layer ADSR: metal
        "hat.metal.amp.attack_ms": _make_param(
            "float", 0.0, 0.0, 20.0, "layer_adsr", "Metal attack time (ms)"
        ),
        "hat.metal.amp.decay_ms": _make_param(
            "float", 70.0, 20.0, 200.0, "layer_adsr", "Metal decay time (ms, closed hat ~70ms)"
        ),
        "hat.metal.amp.sustain": _make_param(
            "float", 1.0, 0.0, 1.0, "layer_adsr", "Metal sustain level (0-1, flat)"
        ),
        "hat.metal.amp.release_ms": _make_param(
            "float", 0.0, 0.0, 100.0, "layer_adsr", "Metal release time (ms)"
        ),
        # Per-layer ADSR: air
        "hat.air.amp.attack_ms": _make_param(
            "float", 0.0, 0.0, 20.0, "layer_adsr", "Air attack time (ms)"
        ),
        "hat.air.amp.decay_ms": _make_param(
            "float", 45.0, 10.0, 150.0, "layer_adsr", "Air decay time (ms, closed hat ~45ms)"
        ),
        "hat.air.amp.sustain": _make_param(
            "float", 1.0, 0.0, 1.0, "layer_adsr", "Air sustain level (0-1, flat)"
        ),
        "hat.air.amp.release_ms": _make_param(
            "float", 0.0, 0.0, 100.0, "layer_adsr", "Air release time (ms)"
        ),
        # Per-layer ADSR: chick
        "hat.chick.amp.attack_ms": _make_param(
            "float", 0.0, 0.0, 10.0, "layer_adsr", "Chick attack time (ms)"
        ),
        "hat.chick.amp.decay_ms": _make_param(
            "float", 10.0, 1.0, 50.0, "layer_adsr", "Chick decay time (ms, very short ~10ms)"
        ),
        "hat.chick.amp.sustain": _make_param(
            "float", 1.0, 0.0, 1.0, "layer_adsr", "Chick sustain level (0-1, flat)"
        ),
        "hat.chick.amp.release_ms": _make_param(
            "float", 0.0, 0.0, 30.0, "layer_adsr", "Chick release time (ms)"
        ),
    },
}


# -----------------------------------------------------------------------------
# DEFAULT_PRESET: Actual default values (includes ADSR + per-layer gain_db)
# -----------------------------------------------------------------------------

DEFAULT_PRESET: Dict[str, Dict[str, Any]] = {
    "kick": {
        # Macro params
        "punch_decay": 0.5,
        "click_amount": 0.5,
        "click_snap": 0.5,
        "tune": 45.0,
        "room_tone_freq": 150.0,
        "room_air": 0.3,
        "distance_ms": 20.0,
        "blend": 0.3,
        # Advanced
        "kick": {
            "knock": {
                "freq_norm": 0.5,
                "decay_ms": 50.0,
            },
            # Per-layer gain_db
            "sub": {
                "gain_db": 0.0,
                "mute": False,
                "amp": {
                    "attack_ms": 0.0,
                    "decay_ms": 180.0,
                    "sustain": 0.0,
                    "release_ms": 10.0,
                },
            },
            "click": {
                "gain_db": -6.0,
                "mute": False,
                "amp": {
                    "attack_ms": 0.0,
                    "decay_ms": 6.0,
                    "sustain": 0.0,
                    "release_ms": 5.0,
                },
            },
            "knock": {
                "gain_db": -4.0,
                "mute": False,
                "amp": {
                    "attack_ms": 0.0,
                    "decay_ms": 120.0,
                    "sustain": 0.0,
                    "release_ms": 15.0,
                },
            },
            "room": {
                "gain_db": -10.0,
                "mute": False,
                "amp": {
                    "attack_ms": 0.0,
                    "decay_ms": 300.0,
                    "sustain": 0.0,
                    "release_ms": 20.0,
                },
            },
        },
    },
    "snare": {
        # Macro params
        "tone": 0.5,
        "wire": 0.4,
        "crack": 0.5,
        "body": 0.5,
        # Per-layer gain_db + ADSR
        "snare": {
            "exciter_body": {
                "gain_db": -200.0,
                "mute": True,
                "amp": {
                    "attack_ms": 0.0,
                    "decay_ms": 50.0,
                    "sustain": 0.0,
                    "release_ms": 5.0,
                },
            },
            "exciter_air": {
                "gain_db": -200.0,
                "mute": True,
                "amp": {
                    "attack_ms": 0.0,
                    "decay_ms": 20.0,
                    "sustain": 0.0,
                    "release_ms": 3.0,
                },
            },
            "shell": {
                "gain_db": 0.0,
                "mute": False,
                "amp": {
                    "attack_ms": 0.0,
                    "decay_ms": 500.0,
                    "sustain": 1.0,
                    "release_ms": 0.0,
                },
            },
            "wires": {
                "gain_db": -3.0,
                "mute": False,
                "amp": {
                    "attack_ms": 0.0,
                    "decay_ms": 140.0,
                    "sustain": 1.0,
                    "release_ms": 0.0,
                },
            },
            "room": {
                "gain_db": -200.0,
                "mute": True,
                "amp": {
                    "attack_ms": 0.0,
                    "decay_ms": 400.0,
                    "sustain": 0.0,
                    "release_ms": 0.0,
                },
            },
        },
    },
    "hat": {
        # Macro params
        "tightness": 0.5,
        "sheen": 0.4,
        "dirt": 0.2,
        "color": 0.5,
        # Advanced
        "hat": {
            "metal": {
                "ratio_jitter": 0.1,
                "gain_db": 0.0,
                "mute": False,
                "amp": {
                    "attack_ms": 0.0,
                    "decay_ms": 70.0,
                    "sustain": 1.0,
                    "release_ms": 0.0,
                },
            },
            "air": {
                "gain_db": 0.0,
                "mute": False,
                "amp": {
                    "attack_ms": 0.0,
                    "decay_ms": 45.0,
                    "sustain": 1.0,
                    "release_ms": 0.0,
                },
            },
            "chick": {
                "gain_db": 0.0,
                "mute": False,
                "amp": {
                    "attack_ms": 0.0,
                    "decay_ms": 10.0,
                    "sustain": 1.0,
                    "release_ms": 0.0,
                },
            },
            "dirt": {
                "legacy_bitcrush": False,
            },
        },
    },
}
