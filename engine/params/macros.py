"""
Macro-to-advanced param mapping (Kick2-style).
Converts high-level macro knobs into implied advanced params (ADSR, gain_db, etc.).
Only applies if macros are present; user-provided advanced params take precedence.
"""
from typing import Dict, Any
from engine.core.params import get_param


def _has_macros(instrument: str, params: dict) -> bool:
    """Check if params contain any {instrument}.macros.* keys."""
    macros_key = f"{instrument}.macros"
    if macros_key in params and isinstance(params[macros_key], dict):
        return len(params[macros_key]) > 0
    # Also check nested structure
    if instrument in params and isinstance(params[instrument], dict):
        if "macros" in params[instrument] and isinstance(params[instrument]["macros"], dict):
            return len(params[instrument]["macros"]) > 0
    return False


def _get_macro(params: dict, instrument: str, macro_name: str, default: float) -> float:
    """Get macro value from params, supporting nested dict structure."""
    # Try nested: params[instrument]["macros"][macro_name]
    if instrument in params and isinstance(params[instrument], dict):
        if "macros" in params[instrument] and isinstance(params[instrument]["macros"], dict):
            if macro_name in params[instrument]["macros"]:
                try:
                    return float(params[instrument]["macros"][macro_name])
                except (TypeError, ValueError):
                    pass
    # Try flat: params[f"{instrument}.macros.{macro_name}"]
    flat_key = f"{instrument}.macros.{macro_name}"
    val = get_param(params, flat_key, default)
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _clamp(value: float, min_val: float, max_val: float) -> float:
    """Clamp value to safe bounds."""
    return max(min_val, min(max_val, float(value)))


def apply_macros(instrument: str, params: dict, original_user_params: dict = None) -> dict:
    """
    Convert macro knobs to implied advanced params.
    Only applies if params contain any {instrument}.macros.* keys.
    User-provided advanced params take precedence (not overwritten).
    
    Args:
        instrument: "kick", "snare", or "hat"
        params: Params dict (may include defaults) - used to read macro values
        original_user_params: Original user params (before merging defaults) - used to check what user provided
    
    Returns dict of implied params that should be merged with user params.
    """
    if not _has_macros(instrument, params):
        return {}
    
    # Use original_user_params if provided, otherwise use params (backward compat)
    user_params = original_user_params if original_user_params is not None else params
    
    implied = {}
    
    if instrument == "kick":
        implied.update(_apply_kick_macros(params, user_params))
    elif instrument == "snare":
        implied.update(_apply_snare_macros(params, user_params))
    elif instrument == "hat":
        implied.update(_apply_hat_macros(params, user_params))
    
    return implied


def _has_user_param(params: dict, key: str) -> bool:
    """Check if user provided a param (not just default)."""
    # Try nested structure first
    keys = key.split(".")
    current = params
    for k in keys:
        if not isinstance(current, dict) or k not in current:
            return False
        current = current[k]
    return True


def _apply_kick_macros(params: dict, user_params: dict) -> dict:
    """Apply kick macro mappings."""
    implied = {}
    
    length_ms = _get_macro(params, "kick", "length_ms", 500.0)
    attack_ms = _get_macro(params, "kick", "attack_ms", 0.0)
    decay_ms = _get_macro(params, "kick", "decay_ms", 180.0)
    click = _get_macro(params, "kick", "click", 0.5)
    click_tight = _get_macro(params, "kick", "click_tight", 0.5)
    punch = _get_macro(params, "kick", "punch", 0.5)
    pitch_drop = _get_macro(params, "kick", "pitch_drop", 0.5)
    room = _get_macro(params, "kick", "room", 0.3)
    
    # length_ms scales: sub/knock/room decay and releases
    length_scale = length_ms / 500.0  # normalize to default 500ms
    length_scale = _clamp(length_scale, 0.4, 2.0)  # safe bounds
    
    # Only set if user hasn't provided these params
    if "kick" not in implied:
        implied["kick"] = {}
    
    # Sub layer
    if "sub" not in implied["kick"]:
        implied["kick"]["sub"] = {}
    if "amp" not in implied["kick"]["sub"]:
        implied["kick"]["sub"]["amp"] = {}
    
    if not _has_user_param(user_params, "kick.sub.amp.decay_ms"):
        implied["kick"]["sub"]["amp"]["decay_ms"] = _clamp(decay_ms * length_scale, 50.0, 500.0)
    if not _has_user_param(user_params, "kick.sub.amp.attack_ms"):
        implied["kick"]["sub"]["amp"]["attack_ms"] = _clamp(attack_ms, 0.0, 50.0)
    if not _has_user_param(user_params, "kick.sub.amp.release_ms"):
        implied["kick"]["sub"]["amp"]["release_ms"] = _clamp(10.0 * length_scale, 5.0, 100.0)
    
    # Click layer
    if "click" not in implied["kick"]:
        implied["kick"]["click"] = {}
    if "amp" not in implied["kick"]["click"]:
        implied["kick"]["click"]["amp"] = {}
    
    if not _has_user_param(user_params, "kick.click.gain_db"):
        # click: 0.0 -> -12dB, 0.5 -> -6dB, 1.0 -> 0dB
        implied["kick"]["click"]["gain_db"] = _clamp((click - 0.5) * 12.0, -12.0, 6.0)
    if not _has_user_param(user_params, "kick.click.amp.decay_ms"):
        # click_tight: 0.0 -> 20ms, 0.5 -> 6ms, 1.0 -> 2ms
        implied["kick"]["click"]["amp"]["decay_ms"] = _clamp(20.0 - (click_tight * 18.0), 2.0, 20.0)
    if not _has_user_param(params, "kick.click.amp.attack_ms"):
        implied["kick"]["click"]["amp"]["attack_ms"] = 0.0  # click attack stays ~0
    
    # FM depth (if we add this param later)
    if "fm" not in implied["kick"]["click"]:
        implied["kick"]["click"]["fm"] = {}
    if not _has_user_param(params, "kick.click.fm.depth"):
        implied["kick"]["click"]["fm"]["depth"] = _clamp(click, 0.0, 1.0)
    if not _has_user_param(params, "kick.click.fm.decay_ms"):
        # click_tight controls FM envelope time
        implied["kick"]["click"]["fm"]["decay_ms"] = _clamp(20.0 - (click_tight * 18.0), 2.0, 20.0)
    
    # Knock layer
    if "knock" not in implied["kick"]:
        implied["kick"]["knock"] = {}
    if "amp" not in implied["kick"]["knock"]:
        implied["kick"]["knock"]["amp"] = {}
    
    if not _has_user_param(params, "kick.knock.amp.decay_ms"):
        implied["kick"]["knock"]["amp"]["decay_ms"] = _clamp(120.0 * length_scale, 20.0, 300.0)
    if not _has_user_param(params, "kick.knock.amp.attack_ms"):
        implied["kick"]["knock"]["amp"]["attack_ms"] = _clamp(attack_ms, 0.0, 30.0)
    if not _has_user_param(params, "kick.knock.amp.release_ms"):
        implied["kick"]["knock"]["amp"]["release_ms"] = _clamp(15.0 * length_scale, 5.0, 100.0)
    
    # Room layer
    if "room" not in implied["kick"]:
        implied["kick"]["room"] = {}
    if "amp" not in implied["kick"]["room"]:
        implied["kick"]["room"]["amp"] = {}
    
    if not _has_user_param(params, "kick.room.gain_db"):
        # room: 0.0 -> -20dB, 0.3 -> -10dB, 1.0 -> 0dB
        implied["kick"]["room"]["gain_db"] = _clamp((room - 0.3) * 14.3, -20.0, 6.0)
    if not _has_user_param(params, "kick.room.distance_ms"):
        # room also affects distance feel
        implied["kick"]["room"]["distance_ms"] = _clamp(room * 40.0, 5.0, 40.0)
    if not _has_user_param(params, "kick.room.amp.decay_ms"):
        implied["kick"]["room"]["amp"]["decay_ms"] = _clamp(300.0 * length_scale, 100.0, 500.0)
    if not _has_user_param(params, "kick.room.amp.release_ms"):
        implied["kick"]["room"]["amp"]["release_ms"] = _clamp(20.0 * length_scale, 10.0, 150.0)
    
    # Punch: transient shaping (if we add this param)
    if "transient_shaper" not in params:
        # punch: 0.0 -> 0.0, 0.5 -> 0.3, 1.0 -> 0.6
        implied["transient_shaper"] = _clamp(punch * 0.6, 0.0, 0.6)
    
    # Pitch drop: pitch envelope depth (if we add this param)
    if not _has_user_param(params, "kick.pitch_drop.amount"):
        implied.setdefault("kick", {}).setdefault("pitch_drop", {})["amount"] = _clamp(pitch_drop, 0.0, 1.0)
    if not _has_user_param(params, "kick.pitch_drop.time_ms"):
        # pitch_drop also affects envelope time
        implied.setdefault("kick", {}).setdefault("pitch_drop", {})["time_ms"] = _clamp(80.0 - (pitch_drop * 40.0), 40.0, 80.0)
    
    return implied


def _apply_snare_macros(params: dict, user_params: dict) -> dict:
    """Apply snare macro mappings."""
    implied = {}
    
    length_ms = _get_macro(params, "snare", "length_ms", 500.0)
    attack_ms = _get_macro(params, "snare", "attack_ms", 0.0)
    body = _get_macro(params, "snare", "body", 0.5)
    tension = _get_macro(params, "snare", "tension", 0.5)
    crack = _get_macro(params, "snare", "crack", 0.5)
    wires = _get_macro(params, "snare", "wires", 0.4)
    room = _get_macro(params, "snare", "room", 0.0)
    
    # length_ms scales shell+wires decays
    length_scale = length_ms / 500.0
    length_scale = _clamp(length_scale, 0.4, 2.0)
    
    if "snare" not in implied:
        implied["snare"] = {}
    
    # Shell layer
    if "shell" not in implied["snare"]:
        implied["snare"]["shell"] = {}
    if "amp" not in implied["snare"]["shell"]:
        implied["snare"]["shell"]["amp"] = {}
    
    if not _has_user_param(user_params, "snare.shell.gain_db"):
        # body: 0.0 -> -6dB, 0.5 -> 0dB, 1.0 -> +3dB
        implied["snare"]["shell"]["gain_db"] = _clamp((body - 0.5) * 9.0, -6.0, 3.0)
    if not _has_user_param(params, "snare.shell.amp.decay_ms"):
        # body also affects shell decay
        implied["snare"]["shell"]["amp"]["decay_ms"] = _clamp((200.0 + body * 300.0) * length_scale, 200.0, 500.0)
    if not _has_user_param(params, "snare.shell.amp.attack_ms"):
        implied["snare"]["shell"]["amp"]["attack_ms"] = _clamp(attack_ms, 0.0, 50.0)
    
    # Tension: brightness on hit (LPF opens initially then closes)
    if not _has_user_param(params, "snare.shell.lpf.initial_cutoff_hz"):
        # tension: 0.0 -> 1500Hz, 0.5 -> 2000Hz, 1.0 -> 3000Hz
        implied.setdefault("snare", {}).setdefault("shell", {}).setdefault("lpf", {})["initial_cutoff_hz"] = _clamp(1500.0 + tension * 1500.0, 1500.0, 3000.0)
    if not _has_user_param(params, "snare.shell.lpf.final_cutoff_hz"):
        # closes to lower value
        implied.setdefault("snare", {}).setdefault("shell", {}).setdefault("lpf", {})["final_cutoff_hz"] = _clamp(1000.0 + tension * 500.0, 1000.0, 1500.0)
    
    # Wires layer
    if "wires" not in implied["snare"]:
        implied["snare"]["wires"] = {}
    if "amp" not in implied["snare"]["wires"]:
        implied["snare"]["wires"]["amp"] = {}
    
    if not _has_user_param(params, "snare.wires.gain_db"):
        # wires: 0.0 -> -12dB, 0.4 -> -3dB, 1.0 -> +3dB
        implied["snare"]["wires"]["gain_db"] = _clamp((wires - 0.4) * 7.5, -12.0, 3.0)
    if not _has_user_param(params, "snare.wires.amp.decay_ms"):
        # wires decay scales with macro
        implied["snare"]["wires"]["amp"]["decay_ms"] = _clamp((80.0 + wires * 60.0) * length_scale, 50.0, 500.0)
    
    # Crack: exciter gain and/or 2k emphasis
    if "exciter_body" not in implied["snare"]:
        implied["snare"]["exciter_body"] = {}
    if not _has_user_param(params, "snare.exciter_body.gain_db"):
        # crack: 0.0 -> -200dB (muted), 0.5 -> -6dB, 1.0 -> 0dB
        if crack > 0.1:
            implied["snare"]["exciter_body"]["gain_db"] = _clamp((crack - 0.5) * 12.0, -200.0, 0.0)
        else:
            implied["snare"]["exciter_body"]["gain_db"] = -200.0
            implied["snare"]["exciter_body"]["mute"] = True
    
    if not _has_user_param(params, "snare.exciter_body.amp.decay_ms"):
        implied.setdefault("snare", {}).setdefault("exciter_body", {}).setdefault("amp", {})["decay_ms"] = _clamp(50.0 - (crack * 20.0), 10.0, 50.0)
    
    # Room send
    if "room" not in implied["snare"]:
        implied["snare"]["room"] = {}
    if not _has_user_param(params, "snare.room.gain_db"):
        # room: 0.0 -> -200dB (muted), 0.5 -> -12dB, 1.0 -> 0dB
        if room > 0.1:
            implied["snare"]["room"]["gain_db"] = _clamp((room - 0.5) * 24.0, -200.0, 0.0)
            implied["snare"]["room"]["mute"] = False
        else:
            implied["snare"]["room"]["gain_db"] = -200.0
            implied["snare"]["room"]["mute"] = True
    
    return implied


def _apply_hat_macros(params: dict, user_params: dict) -> dict:
    """Apply hat macro mappings."""
    implied = {}
    
    length_ms = _get_macro(params, "hat", "length_ms", 500.0)
    attack_ms = _get_macro(params, "hat", "attack_ms", 0.0)
    tightness = _get_macro(params, "hat", "tightness", 0.5)
    sheen = _get_macro(params, "hat", "sheen", 0.4)
    dirt = _get_macro(params, "hat", "dirt", 0.2)
    chick = _get_macro(params, "hat", "chick", 0.5)
    
    # length_ms sets metal/air decay
    length_scale = length_ms / 500.0
    length_scale = _clamp(length_scale, 0.4, 2.0)
    
    if "hat" not in implied:
        implied["hat"] = {}
    
    # Metal layer
    if "metal" not in implied["hat"]:
        implied["hat"]["metal"] = {}
    if "amp" not in implied["hat"]["metal"]:
        implied["hat"]["metal"]["amp"] = {}
    
    if not _has_user_param(user_params, "hat.metal.amp.decay_ms"):
        # tightness shortens decays: 0.0 -> 200ms, 0.5 -> 70ms, 1.0 -> 20ms
        base_decay = 200.0 - (tightness * 180.0)
        implied["hat"]["metal"]["amp"]["decay_ms"] = _clamp(base_decay * length_scale, 20.0, 200.0)
    if not _has_user_param(params, "hat.metal.amp.attack_ms"):
        implied["hat"]["metal"]["amp"]["attack_ms"] = _clamp(attack_ms, 0.0, 20.0)
    
    # Air layer
    if "air" not in implied["hat"]:
        implied["hat"]["air"] = {}
    if "amp" not in implied["hat"]["air"]:
        implied["hat"]["air"]["amp"] = {}
    
    if not _has_user_param(params, "hat.air.gain_db"):
        # sheen raises air gain: 0.0 -> -6dB, 0.4 -> 0dB, 1.0 -> +6dB
        implied["hat"]["air"]["gain_db"] = _clamp((sheen - 0.4) * 15.0, -6.0, 6.0)
    if not _has_user_param(params, "hat.air.amp.decay_ms"):
        base_decay = 150.0 - (tightness * 130.0)
        implied["hat"]["air"]["amp"]["decay_ms"] = _clamp(base_decay * length_scale, 10.0, 150.0)
    
    # Chick layer
    if "chick" not in implied["hat"]:
        implied["hat"]["chick"] = {}
    if not _has_user_param(params, "hat.chick.gain_db"):
        # chick: 0.0 -> -12dB, 0.5 -> 0dB, 1.0 -> +6dB
        implied["hat"]["chick"]["gain_db"] = _clamp((chick - 0.5) * 12.0, -12.0, 6.0)
    if not _has_user_param(params, "hat.chick.amp.decay_ms"):
        implied.setdefault("hat", {}).setdefault("chick", {}).setdefault("amp", {})["decay_ms"] = _clamp(10.0 - (tightness * 5.0), 1.0, 50.0)
    
    # Dirt: safe saturation drive (NOT bitcrush)
    if not _has_user_param(params, "hat.dirt.drive"):
        # dirt: 0.0 -> 1.0, 0.2 -> 1.4, 1.0 -> 3.0
        implied.setdefault("hat", {}).setdefault("dirt", {})["drive"] = _clamp(1.0 + dirt * 2.0, 1.0, 3.0)
    
    # Post tilt (sheen affects HF tilt)
    if not _has_user_param(params, "hat.post.tilt_db"):
        # sheen: 0.0 -> -3dB tilt, 0.4 -> 0dB, 1.0 -> +3dB tilt
        implied.setdefault("hat", {}).setdefault("post", {})["tilt_db"] = _clamp((sheen - 0.4) * 7.5, -3.0, 3.0)
    
    return implied
