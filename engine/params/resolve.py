"""
Parameter resolution: deep-merge DEFAULT_PRESET with incoming params.
Incoming params override defaults at any nesting level.
"""
from typing import Dict, Any
from engine.params.schema import DEFAULT_PRESET


def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    """
    Deep merge two dicts. override values take precedence.
    Returns a new dict (does not mutate inputs).
    """
    result = base.copy()
    
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            # Recursively merge nested dicts
            result[key] = _deep_merge(result[key], value)
        else:
            # Override (or add new) key
            result[key] = value
    
    return result


def resolve_params(instrument: str, params: dict) -> dict:
    """
    Resolve params by deep-merging DEFAULT_PRESET[instrument] with incoming params.
    Incoming params override defaults at any nesting level.
    
    Args:
        instrument: "kick", "snare", or "hat"
        params: Incoming params dict (may be partial)
    
    Returns:
        Fully resolved params dict with all defaults filled in.
    """
    if instrument not in DEFAULT_PRESET:
        # If instrument not in preset, return params as-is
        return params.copy() if params else {}
    
    defaults = DEFAULT_PRESET[instrument]
    
    # Deep merge: incoming params override defaults
    resolved = _deep_merge(defaults, params)
    
    return resolved
