"""
Engine params contract: only params that pass through here reach instrument DSP.
Strips legacy fields. In dev mode, log if legacy was present.
"""
from typing import Dict, Any
import os
import logging

logger = logging.getLogger("neuro-percussion")

# Must match frontend LEGACY_PARAM_KEYS
LEGACY_PARAM_KEYS = frozenset({
    "delayMix",
    "delayFeedback",
    "roomMix",
    "earlyReflections",
    "predelay",
})

DEV = os.environ.get("ENV", "development").lower() in ("development", "dev", "test")


def strip_legacy_params(params: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of params with legacy top-level keys removed."""
    out = dict(params)
    for key in LEGACY_PARAM_KEYS:
        out.pop(key, None)
    return out


def to_engine_params(raw: Dict[str, Any], instrument: str) -> Dict[str, Any]:
    """
    Normalize raw request body to engine params: strip legacy keys.
    This is the single entry point for all params that reach resolve_params + instruments.
    """
    found_legacy = [k for k in LEGACY_PARAM_KEYS if k in raw]
    if found_legacy:
        if DEV:
            logger.warning(
                "[Parameter Contract] Legacy fields stripped before engine: %s (instrument=%s)",
                found_legacy,
                instrument,
            )
        raw = strip_legacy_params(raw)
    return raw
