"""
Param parsing utilities for engine params (dict contract preserved).
Supports dotted keys for optional layer/advanced params; existing macro params
(punch_decay, click_amount, etc.) are unchanged and remain the primary API.
"""
from dataclasses import dataclass
from typing import Any, Optional


# -----------------------------------------------------------------------------
# Param definition (for schema/documentation; lookup still via get_param)
# -----------------------------------------------------------------------------

@dataclass
class ParamDef:
    """Definition of a single parameter. Bounds/unit are optional."""
    name: str
    default: Any
    min: Optional[float] = None
    max: Optional[float] = None
    unit: Optional[str] = None


# -----------------------------------------------------------------------------
# Lookup helpers (preserve existing dict contract; no renames)
# -----------------------------------------------------------------------------

def get_param(params: dict, name: str, default: Any = None) -> Any:
    """
    Read a value from params, supporting dotted keys for nested dicts.
    E.g. get_param(p, "kick.layer_a.gain_db", 0.0) -> p["kick"]["layer_a"]["gain_db"] or default.
    If any intermediate key is missing or not a dict, returns default.
    """
    if not params or not name:
        return default
    keys = name.split(".")
    current = params
    for key in keys[:-1]:
        next_val = current.get(key)
        if next_val is None or not isinstance(next_val, dict):
            return default
        current = next_val
    return current.get(keys[-1], default)


def get_db_gain(params: dict, name: str, default_db: float = 0.0) -> float:
    """
    Read a param interpreted as dB and return linear gain.
    0 dB -> 1.0. Uses get_param for lookup (supports dotted keys).
    """
    raw = get_param(params, name, default_db)
    try:
        db = float(raw)
    except (TypeError, ValueError):
        db = default_db
    return 10.0 ** (db / 20.0)


def clamp_if_bounds(
    value: float,
    min: Optional[float] = None,
    max: Optional[float] = None,
) -> float:
    """
    Clamp value to [min, max] when bounds are not None.
    If both are None, returns value unchanged.
    """
    try:
        v = float(value)
    except (TypeError, ValueError):
        return value
    if min is not None and v < min:
        return min
    if max is not None and v > max:
        return max
    return v
