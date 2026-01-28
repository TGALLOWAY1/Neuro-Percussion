"""
Parameter clamping for realistic mode: caps extreme values that sound synthetic.
Only applied when mode=realistic query param is set.
"""
from typing import Dict, Any


def clamp_params(instrument: str, params: dict) -> dict:
    """
    Clamp params to realistic ranges to avoid harsh synthetic sounds.
    Returns a new dict (does not mutate input).
    
    Clamps:
    - Kick: click_amount <= 0.8 (high click can be too harsh)
    - Snare: crack <= 0.85, wire <= 0.85 (extremes sound synthetic)
    - Hat: dirt <= 0.7 (high dirt is too harsh)
    """
    result = params.copy()
    
    if instrument == "kick":
        if "click_amount" in result:
            result["click_amount"] = min(float(result["click_amount"]), 0.8)
        if "click_snap" in result:
            result["click_snap"] = min(float(result["click_snap"]), 0.85)
        if "room_air" in result:
            result["room_air"] = min(float(result["room_air"]), 0.8)
    
    elif instrument == "snare":
        if "crack" in result:
            result["crack"] = min(float(result["crack"]), 0.85)
        if "wire" in result:
            result["wire"] = min(float(result["wire"]), 0.85)
    
    elif instrument == "hat":
        if "dirt" in result:
            result["dirt"] = min(float(result["dirt"]), 0.7)
        if "sheen" in result:
            result["sheen"] = min(float(result["sheen"]), 0.85)
    
    return result
