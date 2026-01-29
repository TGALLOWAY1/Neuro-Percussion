"""
Canonical engine defaults: single source for synthesis initialization.
Matches frontend spec defaults mapped to engine param shape (mapKickParams, mapSnareParams, mapHatParams).
Used by resolve_params so backend does not silently override canonical defaults.
Source: frontend spec_kick / spec_snare / spec_hat defaults.
"""

from typing import Dict, Any

# Canonical envelope defaults (from frontend spec) mapped to engine nested structure.
# Frontend mapCanonicalToEngineParams produces this shape; we mirror it here so
# resolve_params merge base matches what the UI sends.

def _kick_gain_db_from_pct(pct: float) -> float:
    """Same as frontend: 0-100% -> -24dB to 0dB."""
    if pct <= 0:
        return -200.0
    x = pct / 100.0
    return -24.0 + (x * 24.0)


def _snare_wires_gain_db_from_pct(pct: float) -> float:
    """Same as frontend: -18dB to +3dB."""
    if pct <= 0:
        return -200.0
    x = pct / 100.0
    return -18.0 + (x ** 1.5) * 21.0


def _snare_shell_gain_db_from_pct(pct: float) -> float:
    """Same as frontend: body_amount_pct -> gain_db."""
    if pct <= 0:
        return -200.0
    x = pct / 100.0
    return -6.0 + (x * 6.0)


def _snare_exciter_gain_db_from_pct(pct: float) -> float:
    """Same as frontend: snap_amount_pct."""
    if pct <= 0:
        return -200.0
    x = pct / 100.0
    return -6.0 + (x * 6.0)


def _hat_metal_gain_db_from_pct(pct: float) -> float:
    """Same as frontend: -12 to 0."""
    if pct <= 0:
        return -200.0
    x = pct / 100.0
    return -12.0 + (x * 12.0)


def _hat_air_gain_db_from_pct(pct: float) -> float:
    """Same as frontend: noise_amount_pct."""
    if pct <= 0:
        return -200.0
    x = pct / 100.0
    return -12.0 + (x * 12.0)


# Kick canonical defaults (spec_kick)
ENGINE_DEFAULTS_KICK: Dict[str, Any] = {
    "kick": {
        "sub": {
            "amp": {
                "attack_ms": 1.0,
                "decay_ms": 220.0,
            },
        },
        "pitch_env": {
            "semitones": 24.0,
            "decay_ms": 60.0,
        },
        "click": {
            "gain_db": _kick_gain_db_from_pct(35.0),
            "amp": {
                "attack_ms": 0.0,
                "decay_ms": 12.0,
            },
            "filter_hz": 6000.0,
        },
        "room": {
            "enabled": False,
        },
    },
    "click_snap": 0.5,
}

# Snare canonical defaults (spec_snare). Note: body_decay_ms overwrites shell.amp.decay in mapping.
ENGINE_DEFAULTS_SNARE: Dict[str, Any] = {
    "snare": {
        "shell": {
            "amp": {
                "attack_ms": 1.0,
                "decay_ms": 180.0,  # body_decay_ms
            },
            "pitch_hz": 200.0,
            "gain_db": _snare_shell_gain_db_from_pct(45.0),
        },
        "wires": {
            "gain_db": _snare_wires_gain_db_from_pct(55.0),
            "amp": {
                "decay_ms": 280.0,
            },
            "filter_hz": 5000.0,
        },
        "exciter_body": {
            "gain_db": _snare_exciter_gain_db_from_pct(35.0),
            "amp": {
                "decay_ms": 10.0,
            },
            "filter_hz": 7000.0,
        },
        "repeatMode": "oneshot",
        "room": {
            "enabled": False,
            "mute": True,
            "gain_db": -200.0,
        },
    },
}

# Hat canonical defaults (spec_hat)
ENGINE_DEFAULTS_HAT: Dict[str, Any] = {
    "hat": {
        "metal": {
            "amp": {
                "attack_ms": 0.5,
                "decay_ms": 90.0,
            },
            "gain_db": _hat_metal_gain_db_from_pct(65.0),
            "ratio_jitter": 0.55,
            "brightness_hz": 9000.0,
        },
        "air": {
            "gain_db": _hat_air_gain_db_from_pct(45.0),
            "noise_color": 0.75,
        },
        "choke_group": True,
        "hpf_hz": 6000.0,
        "stereo": {
            "width": 1.1,
            "delay_ms": 6.0,
        },
    },
    "sheen": 0.45,  # noise_amount_pct/100
}

ENGINE_DEFAULTS: Dict[str, Dict[str, Any]] = {
    "kick": ENGINE_DEFAULTS_KICK,
    "snare": ENGINE_DEFAULTS_SNARE,
    "hat": ENGINE_DEFAULTS_HAT,
}
