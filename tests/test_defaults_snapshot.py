"""
Defaults snapshot test per drum: single source is canonical_defaults.ENGINE_DEFAULTS.
Resolved defaults = resolve_params(instrument, {}). Snapshots detect drift.
Run from project root: python -m pytest tests/test_defaults_snapshot.py -v
"""
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine.params.resolve import resolve_params


def test_kick_defaults_snapshot():
    """Kick: resolved defaults snapshot (from ENGINE_DEFAULTS + apply_macros)."""
    resolved = resolve_params("kick", {})
    # Snapshot: top-level and nested keys that matter for engine
    assert "kick" in resolved
    assert resolved["kick"]["sub"]["amp"]["attack_ms"] == 1.0
    assert resolved["kick"]["sub"]["amp"]["decay_ms"] == 220.0
    assert resolved["kick"]["pitch_env"]["semitones"] == 24.0
    assert resolved["kick"]["pitch_env"]["decay_ms"] == 60.0
    assert resolved["kick"]["click"]["gain_db"] < 0
    assert resolved["kick"]["room"]["enabled"] is False
    assert resolved.get("click_snap") == 0.5


def test_snare_defaults_snapshot():
    """Snare: resolved defaults snapshot (from ENGINE_DEFAULTS + apply_macros)."""
    resolved = resolve_params("snare", {})
    assert "snare" in resolved
    assert resolved["snare"]["shell"]["amp"]["attack_ms"] == 1.0
    assert resolved["snare"]["shell"]["amp"]["decay_ms"] == 180.0
    assert resolved["snare"]["shell"]["pitch_hz"] == 200.0
    assert resolved["snare"]["repeatMode"] == "oneshot"
    assert resolved["snare"]["room"]["enabled"] is False
    assert resolved["snare"]["room"]["mute"] is True


def test_hat_defaults_snapshot():
    """Hat: resolved defaults snapshot (from ENGINE_DEFAULTS + apply_macros)."""
    resolved = resolve_params("hat", {})
    assert "hat" in resolved
    assert resolved["hat"]["metal"]["amp"]["attack_ms"] == 0.5
    assert resolved["hat"]["metal"]["amp"]["decay_ms"] == 90.0
    assert resolved["hat"]["choke_group"] is True
    assert resolved["hat"]["hpf_hz"] == 6000.0
    assert resolved.get("sheen") == 0.45
