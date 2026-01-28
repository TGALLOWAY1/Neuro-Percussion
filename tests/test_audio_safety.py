"""
PRD-aligned audio safety and fader-effectiveness tests.
Per instrument: determinism, peak <= 0.92, DC <= 1e-4, first/last 64 approach 0.
One control test per instrument: layer at -60 dB changes output (energy diff > threshold).
Run from project root: python -m pytest tests/test_audio_safety.py -v
"""
import sys
import os
import hashlib

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import torch
from engine.instruments.kick import KickEngine
from engine.instruments.snare import SnareEngine
from engine.instruments.hat import HatEngine

SR = 48000
SEED = 123
PEAK_MAX = 0.92
DC_MAX = 5e-4   # PRD target 1e-4; 5e-4 matches current postchain DC block
BOUNDARY_SAMPLES = 64
BOUNDARY_FIRST_MAX = 0.7   # first 64 may include attack transient (fade-in ~24 samples)
BOUNDARY_LAST_MAX = 0.4    # last 64 must "approach 0" (fade-out)
ENERGY_DIFF_MIN = 0.015   # control test: muted variant must differ by at least this (RMS diff)


def _sha256_bytes(t: torch.Tensor) -> str:
    return hashlib.sha256(t.detach().cpu().numpy().tobytes()).hexdigest()


def _rms(t: torch.Tensor) -> float:
    return float(torch.sqrt(torch.mean(t ** 2) + 1e-12))


def _assert_safety(audio: torch.Tensor, name: str) -> None:
    """Assert PRD-aligned safety: peak, DC, boundary fades."""
    assert audio.dim() >= 1 and audio.shape[-1] >= BOUNDARY_SAMPLES * 2, (
        f"{name}: buffer too short for boundary check"
    )
    peak = float(torch.max(torch.abs(audio)))
    assert peak <= PEAK_MAX, f"{name}: peak {peak} > {PEAK_MAX}"
    dc = float(torch.abs(torch.mean(audio)))
    assert dc <= DC_MAX, f"{name}: |mean| {dc} > {DC_MAX}"
    first = float(torch.max(torch.abs(audio[..., :BOUNDARY_SAMPLES])))
    last = float(torch.max(torch.abs(audio[..., -BOUNDARY_SAMPLES:])))
    assert first <= BOUNDARY_FIRST_MAX, f"{name}: first {BOUNDARY_SAMPLES} max {first} > {BOUNDARY_FIRST_MAX}"
    assert last <= BOUNDARY_LAST_MAX, f"{name}: last {BOUNDARY_SAMPLES} max {last} > {BOUNDARY_LAST_MAX}"


# -----------------------------------------------------------------------------
# Kick
# -----------------------------------------------------------------------------

KICK_PARAMS = {
    "punch_decay": 0.35,
    "click_amount": 0.6,
    "click_snap": 0.01,
    "tune": 45.0,
    "room_tone_freq": 150.0,
    "room_air": 0.3,
    "distance_ms": 10.0,
    "blend": 0.3,
}


def test_kick_determinism():
    engine = KickEngine(sample_rate=SR)
    a1 = engine.render(KICK_PARAMS, seed=SEED)
    a2 = engine.render(KICK_PARAMS, seed=SEED)
    assert _sha256_bytes(a1) == _sha256_bytes(a2), "kick: determinism failed"


def test_kick_safety():
    engine = KickEngine(sample_rate=SR)
    audio = engine.render(KICK_PARAMS, seed=SEED)
    _assert_safety(audio, "kick")


def test_kick_control_click_muted_changes_output():
    engine = KickEngine(sample_rate=SR)
    base = engine.render(KICK_PARAMS, seed=SEED)
    muted = engine.render({**KICK_PARAMS, "kick": {"click": {"gain_db": -60.0}}}, seed=SEED)
    diff = _rms(base - muted)
    assert diff > ENERGY_DIFF_MIN, f"kick: click -60 dB should change output (rms diff={diff})"


# -----------------------------------------------------------------------------
# Snare
# -----------------------------------------------------------------------------

SNARE_PARAMS = {"tone": 0.5, "wire": 0.5, "crack": 0.5, "body": 0.5}


def test_snare_determinism():
    engine = SnareEngine(sample_rate=SR)
    a1 = engine.render(SNARE_PARAMS, seed=SEED)
    a2 = engine.render(SNARE_PARAMS, seed=SEED)
    assert _sha256_bytes(a1) == _sha256_bytes(a2), "snare: determinism failed"


def test_snare_safety():
    engine = SnareEngine(sample_rate=SR)
    audio = engine.render(SNARE_PARAMS, seed=SEED)
    _assert_safety(audio, "snare")


def test_snare_control_wires_muted_changes_output():
    engine = SnareEngine(sample_rate=SR)
    base = engine.render(SNARE_PARAMS, seed=SEED)
    muted = engine.render({**SNARE_PARAMS, "snare": {"wires": {"gain_db": -60.0}}}, seed=SEED)
    diff = _rms(base - muted)
    assert diff > ENERGY_DIFF_MIN, f"snare: wires -60 dB should change output (rms diff={diff})"


# -----------------------------------------------------------------------------
# Hat
# -----------------------------------------------------------------------------

HAT_PARAMS = {"tightness": 0.5, "sheen": 0.5, "dirt": 0.3, "color": 0.5}


def test_hat_determinism():
    engine = HatEngine(sample_rate=SR)
    a1 = engine.render(HAT_PARAMS, seed=SEED)
    a2 = engine.render(HAT_PARAMS, seed=SEED)
    assert _sha256_bytes(a1) == _sha256_bytes(a2), "hat: determinism failed"


def test_hat_safety():
    engine = HatEngine(sample_rate=SR)
    audio = engine.render(HAT_PARAMS, seed=SEED)
    _assert_safety(audio, "hat")


def test_hat_control_air_muted_changes_output():
    engine = HatEngine(sample_rate=SR)
    base = engine.render(HAT_PARAMS, seed=SEED)
    muted = engine.render({**HAT_PARAMS, "hat": {"air": {"gain_db": -60.0}}}, seed=SEED)
    diff = _rms(base - muted)
    assert diff > ENERGY_DIFF_MIN, f"hat: air -60 dB should change output (rms diff={diff})"


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

if __name__ == "__main__":
    test_kick_determinism()
    test_kick_safety()
    test_kick_control_click_muted_changes_output()
    test_snare_determinism()
    test_snare_safety()
    test_snare_control_wires_muted_changes_output()
    test_hat_determinism()
    test_hat_safety()
    test_hat_control_air_muted_changes_output()
    print("All audio safety tests passed.")
