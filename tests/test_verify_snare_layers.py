"""
Verify snare explicit layers: legacy params, wires -60 dB reduces HF, determinism.
Run from project root: python -m pytest tests/test_verify_snare_layers.py -v
Or: python tests/test_verify_snare_layers.py
"""
import sys
import os
import hashlib

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import torch
from engine.instruments.snare import SnareEngine
from engine.ml.features import FeatureExtractor


def test_legacy_params_only_succeeds():
    """Render with legacy params only -> should succeed and not crash."""
    engine = SnareEngine(sample_rate=48000)
    params = {"tone": 0.5, "wire": 0.4, "crack": 0.6, "body": 0.7}
    audio = engine.render(params, seed=123)
    assert audio.dim() >= 1
    assert audio.shape[-1] > 0
    assert not torch.isnan(audio).any()
    assert not torch.isinf(audio).any()
    assert torch.max(torch.abs(audio)) > 0


def test_wires_gain_db_minus_60_reduces_high_frequency():
    """snare.wires.gain_db=-60 -> reduced high-frequency energy (spectral centroid)."""
    engine = SnareEngine(sample_rate=48000)
    extractor = FeatureExtractor(sample_rate=48000)

    legacy = {"tone": 0.5, "wire": 0.5, "crack": 0.5, "body": 0.5}
    audio_full = engine.render(legacy, seed=42)
    feat_full = extractor.compute(audio_full)
    centroid_full = feat_full["spectral_centroid"]

    params_muted_wires = dict(legacy)
    params_muted_wires["snare"] = {"wires": {"gain_db": -60.0}}
    audio_muted_wires = engine.render(params_muted_wires, seed=42)
    feat_muted = extractor.compute(audio_muted_wires)
    centroid_muted = feat_muted["spectral_centroid"]

    assert centroid_muted < centroid_full, (
        f"Expected lower spectral centroid when wires at -60 dB: got {centroid_muted} vs {centroid_full}"
    )


def test_determinism_same_params_seed():
    """Same params + seed -> identical sha256 of tensor bytes."""
    engine = SnareEngine(sample_rate=48000)
    params = {"tone": 0.4, "wire": 0.6, "crack": 0.5, "body": 0.5}
    a1 = engine.render(params, seed=999)
    a2 = engine.render(params, seed=999)
    b1 = a1.detach().cpu().numpy().tobytes()
    b2 = a2.detach().cpu().numpy().tobytes()
    h1 = hashlib.sha256(b1).hexdigest()
    h2 = hashlib.sha256(b2).hexdigest()
    assert h1 == h2, f"Determinism failed: hashes {h1} vs {h2}"


if __name__ == "__main__":
    test_legacy_params_only_succeeds()
    test_wires_gain_db_minus_60_reduces_high_frequency()
    test_determinism_same_params_seed()
    print("All snare layer tests passed.")
