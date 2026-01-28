"""
Parameter resolution: deep-merge DEFAULT_PRESET with incoming params, then apply macros.
Incoming params override defaults at any nesting level.
If macros exist, compute implied advanced params and merge them (user advanced params still win).
"""
from typing import Dict, Any
from engine.params.schema import DEFAULT_PRESET
from engine.params.macros import apply_macros


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


def _has_user_param_nested(user_params: Dict[str, Any], key_path: list[str]) -> bool:
    """Check if user provided a nested param at the given path."""
    current = user_params
    for key in key_path:
        if not isinstance(current, dict) or key not in current:
            return False
        current = current[key]
    return True


def _safe_merge_implied(base: Dict[str, Any], implied: Dict[str, Any], user_params: Dict[str, Any], path: list[str] = None) -> Dict[str, Any]:
    """
    Merge implied params into base, overwriting defaults but not user-provided params.
    Since apply_macros already checks user_params before generating implied values,
    we can merge implied normally - it won't contain user-provided keys.
    This function is extra safety to ensure user params win.
    """
    if path is None:
        path = []
    
    result = base.copy()
    
    for key, value in implied.items():
        current_path = path + [key]
        
        if key not in result:
            # Key doesn't exist, add it (unless user provided it at this exact path)
            if not _has_user_param_nested(user_params, current_path):
                result[key] = value
        elif isinstance(result[key], dict) and isinstance(value, dict):
            # Both are dicts, recursively merge
            # Only skip if user provided the entire dict at this path
            if _has_user_param_nested(user_params, current_path) and not isinstance(user_params.get(key, {}), dict):
                # User provided a non-dict value at this path, don't overwrite
                continue
            user_nested = user_params.get(key, {}) if isinstance(user_params.get(key), dict) else {}
            result[key] = _safe_merge_implied(result[key], value, user_nested, current_path)
        else:
            # Key exists in base (from defaults), overwrite with implied value
            # unless user explicitly provided this exact path
            if not _has_user_param_nested(user_params, current_path):
                result[key] = value
    
    return result


def resolve_params(instrument: str, params: dict) -> dict:
    """
    Resolve params by:
    1. Starting from DEFAULT_PRESET[instrument]
    2. Merging incoming params onto it (user params override defaults)
    3. If macro keys exist, computing implied advanced params via apply_macros()
    4. Merging implied params into merged (but not overwriting explicit user advanced keys)
    
    Args:
        instrument: "kick", "snare", or "hat"
        params: Incoming params dict (may be partial, may include macros)
    
    Returns:
        Fully resolved params dict with defaults, user params, and macro-implied params.
    """
    if instrument not in DEFAULT_PRESET:
        # If instrument not in preset, return params as-is
        return params.copy() if params else {}
    
    defaults = DEFAULT_PRESET[instrument]
    
    # Step 1-2: Deep merge defaults with incoming params (user params override defaults)
    merged = _deep_merge(defaults, params)
    
    # Step 3: If macros exist, compute implied advanced params
    # Pass merged dict to apply_macros (for macro values) and original params (for user param detection)
    original_params = params.copy() if params else {}
    implied = apply_macros(instrument, merged, original_user_params=original_params)
    
    # Step 4: Merge implied into merged, but don't overwrite explicit user advanced keys
    # apply_macros already checks for user params, but we use safe merge to be extra safe
    if implied:
        resolved = _safe_merge_implied(merged, implied, original_params)
    else:
        resolved = merged
    
    return resolved
