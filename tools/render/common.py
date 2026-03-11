"""Shared utilities for render subcommands."""
import copy


def resolve_spec(instrument: str, params: dict) -> dict:
    """Resolve spec params for any instrument, merging implied params."""
    from engine.params.spec_resolver import (
        resolve_kick_spec_params,
        resolve_snare_spec_params,
        resolve_hat_spec_params,
    )

    if instrument == "kick":
        spec_implied = resolve_kick_spec_params(params)
    elif instrument == "snare":
        spec_implied = resolve_snare_spec_params(params)
    elif instrument == "hat":
        spec_implied = resolve_hat_spec_params(params)
    else:
        spec_implied = {}

    if spec_implied:
        return _deep_merge_spec(params, spec_implied)
    return params


def _deep_merge_spec(base: dict, override: dict) -> dict:
    """Deep merge override into base (base keys win if already present)."""
    result = copy.deepcopy(base)
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge_spec(result[key], value)
        else:
            if key not in result:
                result[key] = copy.deepcopy(value)
    return result


def shallow_deep_merge(base: dict, *additions: dict) -> dict:
    """Merge dicts recursively (later additions override)."""
    out = dict(base)
    for d in additions:
        for k, v in d.items():
            if k not in out or not isinstance(out[k], dict) or not isinstance(v, dict):
                out[k] = v
            else:
                out[k] = shallow_deep_merge(out[k], v)
    return out


def deep_set(d: dict, keys: list, value: float) -> dict:
    """Set a deeply nested key in a dict (returns new copy)."""
    result = copy.deepcopy(d)
    current = result
    for key in keys[:-1]:
        if key not in current:
            current[key] = {}
        elif not isinstance(current[key], dict):
            current[key] = {}
        else:
            current[key] = copy.deepcopy(current[key])
        current = current[key]
    current[keys[-1]] = value
    return result
