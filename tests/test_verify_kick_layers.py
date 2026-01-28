"""
Verify kick explicit layers: legacy params, per-layer gain/mute, determinism.
Run from project root: python -m pytest tests/test_verify_kick_layers.py -v
Or: python tests/test_verify_kick_layers.py
"""
import sys
import os
import hashlib

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import torch
from engine.instruments.kick import KickEngine


def _peak_first_ms(audio: torch.Tensor, sample_rate: int, ms: float = 10.0) -> float:
    n = int(ms * 1e-3 * sample_rate)
    n = min(n, audio.shape[-1])
    if n <= 0:
        return 0.0
    return float(torch.max(torch.abs(audio[..., :n])))


def test_legacy_params_only_succeeds():
    """Render with legacy params only -> should succeed and not crash."""
    engine = KickEngine(sample_rate=48000)
    params = {
        "punch_decay": 0.4,
        "click_amount": 0.7,
        "click_snap": 0.01,
        "tune": 45.0,
        "room_tone_freq": 180.0,
        "room_air": 0.5,
        "distance_ms": 20.0,
        "blend": 0.4,
    }
    audio = engine.render(params, seed=123)
    assert audio.dim() >= 1
    assert audio.shape[-1] > 0
    assert not torch.isnan(audio).any()
    assert not torch.isinf(audio).any()
    assert torch.max(torch.abs(audio)) > 0


def test_click_gain_db_lowers_early_peak():
    """kick.click.gain_db=-60 -> click reduces; peak of first 10ms is lower."""
    engine = KickEngine(sample_rate=48000)
    sr = 48000
    legacy = {
        "punch_decay": 0.3,
        "click_amount": 0.7,
        "click_snap": 0.01,
        "tune": 45.0,
        "blend": 0.2,
    }
    audio_full = engine.render(legacy, seed=42)
    peak_full = _peak_first_ms(audio_full, sr, 10.0)

    params_muted_click = dict(legacy)
    params_muted_click["kick"] = {"click": {"gain_db": -60.0}}

    audio_muted_click = engine.render(params_muted_click, seed=42)
    peak_muted = _peak_first_ms(audio_muted_click, sr, 10.0)

    assert peak_muted < peak_full, (
        f"Expected early peak to drop when click.gain_db=-60: got {peak_muted} vs {peak_full}"
    )


def test_determinism_same_params_seed():
    """Same params + seed -> identical sha256 of tensor bytes."""
    engine = KickEngine(sample_rate=48000)
    params = {
        "punch_decay": 0.35,
        "click_amount": 0.6,
        "tune": 50.0,
        "blend": 0.3,
    }
    a1 = engine.render(params, seed=999)
    a2 = engine.render(params, seed=999)
    b1 = a1.detach().cpu().numpy().tobytes()
    b2 = a2.detach().cpu().numpy().tobytes()
    h1 = hashlib.sha256(b1).hexdigest()
    h2 = hashlib.sha256(b2).hexdigest()
    assert h1 == h2, f"Determinism failed: hashes {h1} vs {h2}"


if __name__ == "__main__":
    test_legacy_params_only_succeeds()
    test_click_gain_db_lowers_early_peak()
    test_determinism_same_params_seed()
    print("All kick layer tests passed.")
