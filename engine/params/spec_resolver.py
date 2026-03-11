"""
Shared declarative spec → advanced param resolution.

Each instrument provides:
- spec_defs: list of (key, default, min_val, max_val) for extraction + clamping
- mappings: list of (target_key, source) for implied param generation
    source can be: a string (spec key name), a constant, or a callable(spec_values) -> value
- bool_keys: set of spec param names needing bool→float conversion

The resolver handles: presence detection, nested/flat param lookup,
clamping, user-param precedence, and nested dict construction.
"""
from engine.core.params import get_param


def _has_spec_keys(params: dict, instrument: str) -> bool:
    """Check if any {instrument}.spec.* keys exist in params."""
    prefix = f"{instrument}.spec."
    if any(key.startswith(prefix) for key in params):
        return True
    inst_dict = params.get(instrument)
    return isinstance(inst_dict, dict) and "spec" in inst_dict


def _get_spec_value(params: dict, instrument: str, key: str,
                    default: float, bool_keys: frozenset) -> float:
    """Get a spec param value, checking nested then flat format."""
    # Try nested: params[instrument]["spec"][key]
    inst = params.get(instrument)
    if isinstance(inst, dict):
        spec = inst.get("spec")
        if isinstance(spec, dict) and key in spec:
            val = spec[key]
            if key in bool_keys and isinstance(val, bool):
                return 1.0 if val else 0.0
            try:
                return float(val)
            except (TypeError, ValueError):
                pass
    # Try literal flat key: params["instrument.spec.key"]
    flat_key = f"{instrument}.spec.{key}"
    if flat_key in params:
        val = params[flat_key]
        if key in bool_keys and isinstance(val, bool):
            return 1.0 if val else 0.0
        try:
            return float(val)
        except (TypeError, ValueError):
            pass
    # Try dotted navigation via get_param (handles mixed nesting)
    val = get_param(params, flat_key, None)
    if val is not None:
        if key in bool_keys and isinstance(val, bool):
            return 1.0 if val else 0.0
        try:
            return float(val)
        except (TypeError, ValueError):
            pass
    return default


def _has_user_param(params: dict, key: str) -> bool:
    """Check if user already provided a nested param path."""
    keys = key.split(".")
    current = params
    for k in keys:
        if not isinstance(current, dict) or k not in current:
            return False
        current = current[k]
    return True


def _set_nested(d: dict, key: str, value):
    """Set a value in a nested dict using dot-separated key."""
    keys = key.split(".")
    current = d
    for k in keys[:-1]:
        current = current.setdefault(k, {})
    current[keys[-1]] = value


def resolve_spec_params(params: dict, instrument: str,
                        spec_defs: list, mappings: list,
                        bool_keys: frozenset = frozenset()) -> dict:
    """
    Generic spec param resolver.

    Args:
        params: Raw input params dict
        instrument: Instrument prefix ("kick", "snare", "hat")
        spec_defs: List of (key, default, min_val, max_val) tuples
        mappings: List of (target_key, source) tuples where source is:
            - str: use that key from extracted spec values
            - callable: call with (spec_values, params) dict, return value (None to skip)
            - other: use as constant value
        bool_keys: Set of spec param names that need bool→float conversion

    Returns:
        Dict of implied params to merge (nested structure).
    """
    if not _has_spec_keys(params, instrument):
        return {}

    # Extract and clamp spec values
    spec = {}
    for key, default, min_val, max_val in spec_defs:
        val = _get_spec_value(params, instrument, key, default, bool_keys)
        spec[key] = max(min_val, min(max_val, val))

    # Apply mappings, respecting user precedence
    implied = {}
    for target_key, source in mappings:
        if _has_user_param(params, target_key):
            continue
        if callable(source):
            value = source(spec, params)
        elif isinstance(source, str):
            value = spec[source]
        else:
            value = source
        if value is not None:
            _set_nested(implied, target_key, value)

    return implied


# ---------------------------------------------------------------------------
# Per-instrument spec definitions
# ---------------------------------------------------------------------------

# --- Kick ---

KICK_SPEC_DEFS = [
    # (key, default, min, max)
    ("click_level",        0.5,    0.0,   1.0),
    ("click_attack_ms",    0.5,    0.0,   5.0),
    ("click_filter_hz",    7000.0, 200.0, 16000.0),
    ("hardness",           0.6,    0.0,   1.0),
    ("pitch_hz",           55.0,   40.0,  150.0),
    ("pitch_env_semitones", 24.0,  0.0,   100.0),
    ("pitch_decay_ms",     50.0,   10.0,  300.0),
    ("amp_decay_ms",       350.0,  150.0, 800.0),
    ("drive_fold",         0.0,    0.0,   1.0),
    ("eq_scoop_hz",        300.0,  200.0, 400.0),
    ("eq_scoop_db",        -6.0,   -9.0,  0.0),
    ("global_attack_ms",   0.0,    0.0,   10.0),
    ("comp_ratio",         3.0,    1.0,   4.0),
    ("comp_attack_ms",     5.0,    1.0,   20.0),
    ("comp_release_ms",    200.0,  50.0,  400.0),
]

KICK_SPEC_MAPPINGS = [
    # Body/Sub layer
    ("kick.sub.amp.decay_ms",    "amp_decay_ms"),
    ("kick.sub.amp.attack_ms",   "global_attack_ms"),
    # Pitch (also check kick.tune for precedence)
    ("tune",                     lambda s, p: None if _has_user_param(p, "kick.tune") else s["pitch_hz"]),
    ("kick.pitch_env.semitones", "pitch_env_semitones"),
    ("kick.pitch_env.decay_ms",  "pitch_decay_ms"),
    # Click layer: perceptual curve for gain
    ("kick.click.gain_db",       lambda s, p: -24.0 * (1.0 - s["click_level"] ** 2)),
    ("kick.click.amp.attack_ms", "click_attack_ms"),
    ("kick.click.amp.decay_ms",  8.0),
    ("kick.click.filter_hz",     "click_filter_hz"),
    ("kick.click.hardness",      "hardness"),
    # Body drive
    ("kick.sub.drive_fold",      "drive_fold"),
    # Knock attack
    ("kick.knock.amp.attack_ms", "global_attack_ms"),
    # EQ scoop
    ("kick.eq.scoop_hz",         "eq_scoop_hz"),
    ("kick.eq.scoop_db",         "eq_scoop_db"),
    # Compressor
    ("kick.comp.ratio",          "comp_ratio"),
    ("kick.comp.attack_ms",      "comp_attack_ms"),
    ("kick.comp.release_ms",     "comp_release_ms"),
]


# --- Snare ---

SNARE_SPEC_DEFS = [
    ("tune_hz",        200.0, 120.0, 250.0),
    ("tone_decay_ms",  150.0, 50.0,  400.0),
    ("pitch_env_st",   12.0,  0.0,   24.0),
    ("snare_level",    0.6,   0.0,   1.0),
    ("noise_decay_ms", 250.0, 100.0, 600.0),
    ("wire_filter_hz", 5000.0, 1000.0, 10000.0),
    ("snap_attack_ms", 1.0,   0.0,   10.0),
    ("hardness",       0.5,   0.0,   1.0),
    ("box_cut_db",     -6.0,  -15.0, 0.0),
    ("box_cut_hz",     500.0, 400.0, 600.0),
]

SNARE_SPEC_MAPPINGS = [
    # Shell layer
    ("snare.shell.amp.decay_ms",     "tone_decay_ms"),
    ("snare.shell.amp.attack_ms",    "snap_attack_ms"),
    ("snare.shell.amp.release_ms",   50.0),
    ("snare.shell.pitch_hz",         "tune_hz"),
    ("snare.shell.pitch_env_st",     "pitch_env_st"),
    ("snare.shell.pitch_decay_ms",   lambda s, p: min(s["tone_decay_ms"], 80.0)),
    # Wires layer
    ("snare.wires.amp.decay_ms",     "noise_decay_ms"),
    ("snare.wires.amp.attack_ms",    0.0),
    ("snare.wires.amp.release_ms",   90.0),
    ("snare.wires.filter_hz",        "wire_filter_hz"),
    # Wires gain: perceptual curve 0→-18dB, 0.5→-6dB, 1.0→+3dB
    ("snare.wires.gain_db",          lambda s, p: -18.0 + (s["snare_level"] ** 1.5) * 21.0),
    # Exciter body (snap)
    ("snare.exciter_body.amp.decay_ms",   5.0),
    ("snare.exciter_body.amp.attack_ms",  "snap_attack_ms"),
    ("snare.exciter_body.amp.release_ms", 5.0),
    # Exciter air (snap)
    ("snare.exciter_air.amp.decay_ms",    3.0),
    ("snare.exciter_air.amp.attack_ms",   "snap_attack_ms"),
    ("snare.exciter_air.amp.release_ms",  5.0),
    # Snap gains
    ("snare.exciter_body.gain_db",   -6.0),
    ("snare.exciter_air.gain_db",    -6.0),
    # Hardness
    ("snare.snap.hardness",          "hardness"),
    # Box cut notch
    ("snare.box_cut.hz",             "box_cut_hz"),
    ("snare.box_cut.db",             "box_cut_db"),
]


# --- Hat ---

HAT_BOOL_KEYS = frozenset({"is_open", "choke_group"})

HAT_SPEC_DEFS = [
    ("metal_pitch_hz", 800.0,  300.0, 10000.0),
    ("dissonance",     0.7,    0.0,   1.0),
    ("fm_amount",      0.5,    0.0,   1.0),
    ("hpf_hz",         3000.0, 300.0, 8000.0),
    ("color_hz",       8000.0, 2000.0, 15000.0),
    ("decay_ms",       80.0,   20.0,  2000.0),
    ("choke_group",    1.0,    0.0,   1.0),
    ("is_open",        0.0,    0.0,   1.0),
    ("attack_ms",      0.0,    0.0,   10.0),
]


def _hat_metal_decay(s: dict, p: dict):
    if s["is_open"] > 0.5:
        return max(s["decay_ms"], 600.0)
    return min(s["decay_ms"], 100.0)


def _hat_metal_attack(s: dict, p: dict):
    if s["is_open"] > 0.5:
        return s["attack_ms"] if s["attack_ms"] > 0 else 5.0
    return 0.0


HAT_SPEC_MAPPINGS = [
    # Metal pitch
    ("hat.metal.base_hz",        "metal_pitch_hz"),
    # Dissonance → jitter
    ("hat.metal.ratio_jitter",   lambda s, p: s["dissonance"] * 0.2),
    # FM → dirt (conservative)
    ("dirt",                     lambda s, p: s["fm_amount"] * 0.7),
    # HPF
    ("hat.hpf_hz",               "hpf_hz"),
    # Color emphasis
    ("hat.color_hz",             "color_hz"),
    # Envelope: open vs closed (conditional)
    ("hat.metal.amp.decay_ms",   _hat_metal_decay),
    ("hat.metal.amp.attack_ms",  _hat_metal_attack),
    ("hat.air.amp.decay_ms",     _hat_metal_decay),
    ("hat.air.amp.attack_ms",    _hat_metal_attack),
    # Chick layer (always short)
    ("hat.chick.amp.decay_ms",   5.0),
    # Choke group
    ("hat.choke_group",          lambda s, p: bool(s["choke_group"] > 0.5)),
    # is_open flag
    ("hat.is_open",              lambda s, p: bool(s["is_open"] > 0.5)),
]


# ---------------------------------------------------------------------------
# Convenience wrappers (backward-compatible API)
# ---------------------------------------------------------------------------

def resolve_kick_spec_params(params: dict) -> dict:
    return resolve_spec_params(params, "kick", KICK_SPEC_DEFS, KICK_SPEC_MAPPINGS)


def resolve_snare_spec_params(params: dict) -> dict:
    return resolve_spec_params(params, "snare", SNARE_SPEC_DEFS, SNARE_SPEC_MAPPINGS)


def resolve_hat_spec_params(params: dict) -> dict:
    return resolve_spec_params(params, "hat", HAT_SPEC_DEFS, HAT_SPEC_MAPPINGS,
                               bool_keys=HAT_BOOL_KEYS)
