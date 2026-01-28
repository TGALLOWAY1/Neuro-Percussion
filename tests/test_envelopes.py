"""
Unit tests for engine/dsp/envelopes: ADSR, helpers, and sample accuracy.
Run from project root: python -m pytest tests/test_envelopes.py -v
Or: python tests/test_envelopes.py
"""
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import torch
from engine.dsp.envelopes import (
    db_to_lin,
    ms_to_s,
    clamp01,
    ADSR,
    Envelope,
)


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def test_db_to_lin():
    assert db_to_lin(0.0) == 1.0
    assert abs(db_to_lin(-6.0) - 0.5) < 0.01
    assert abs(db_to_lin(6.0) - 2.0) < 0.01


def test_ms_to_s():
    assert ms_to_s(0) == 0.0
    assert ms_to_s(1000) == 1.0
    assert ms_to_s(50) == 0.05


def test_clamp01():
    assert clamp01(0.5) == 0.5
    assert clamp01(-0.1) == 0.0
    assert clamp01(1.5) == 1.0
    t = torch.tensor([-0.2, 0.5, 1.2])
    out = clamp01(t)
    assert out[0].item() == 0.0
    assert out[1].item() == 0.5
    assert out[2].item() == 1.0


# -----------------------------------------------------------------------------
# ADSR: length, boundary, no NaN/Inf
# -----------------------------------------------------------------------------

def test_adsr_correct_length():
    """Envelope length must equal int(duration_s * sample_rate)."""
    sr = 48000
    duration_s = 0.5
    adsr = ADSR(sr, attack_s=0.01, decay_s=0.1, sustain_level=0.5, release_s=0.2)
    env = adsr.render(duration_s)
    expected_len = int(duration_s * sr)
    assert env.shape == (expected_len,), f"expected length {expected_len}, got {env.shape[0]}"


def test_adsr_boundary_approaches_zero_when_release_gt_zero():
    """If release > 0 and gate ends before buffer end, end of buffer should approach 0."""
    sr = 48000
    duration_s = 0.5
    adsr = ADSR(
        sr,
        attack_s=0.01,
        decay_s=0.05,
        sustain_level=0.3,
        release_s=0.15,
        hold_s=0.0,
        curve="exp",
    )
    # Gate at 0.2 s so release runs from 0.2 s to 0.35 s; rest of buffer (0.35–0.5 s) is zeros
    env = adsr.render(duration_s, gate_s=0.2)
    n = env.shape[0]
    # Very end of buffer should be close to 0 (release has finished)
    assert env[-1].item() < 0.05, f"last sample should be near 0, got {env[-1].item()}"
    # Last 5% of samples should be near 0 (past release or late in release)
    tail = env[int(0.95 * n) :]
    assert tail.numel() > 0
    assert torch.max(torch.abs(tail)) < 0.1, (
        f"end of buffer should approach 0, got max |tail| = {torch.max(torch.abs(tail)).item()}"
    )


def test_adsr_no_nan_inf():
    """Output must contain no NaN or Inf."""
    sr = 48000
    adsr = ADSR(
        sr,
        attack_s=0.01,
        decay_s=0.1,
        sustain_level=0.5,
        release_s=0.2,
        hold_s=0.02,
        curve="exp",
    )
    env = adsr.render(0.5)
    assert not torch.isnan(env).any(), "output contains NaN"
    assert not torch.isinf(env).any(), "output contains Inf"


def test_adsr_linear_curve_no_nan_inf():
    """Linear curve must also yield finite values."""
    sr = 48000
    adsr = ADSR(
        sr,
        attack_s=0.01,
        decay_s=0.1,
        sustain_level=0.5,
        release_s=0.2,
        hold_s=0.0,
        curve="linear",
    )
    env = adsr.render(0.5)
    assert not torch.isnan(env).any(), "linear output contains NaN"
    assert not torch.isinf(env).any(), "linear output contains Inf"


def test_adsr_gate_none_full_duration():
    """gate_s=None -> release at end of buffer; length still correct."""
    sr = 48000
    duration_s = 0.3
    adsr = ADSR(sr, attack_s=0.01, decay_s=0.05, sustain_level=0.6, release_s=0.1)
    env = adsr.render(duration_s, gate_s=None)
    assert env.shape[0] == int(duration_s * sr)
    assert not torch.isnan(env).any() and not torch.isinf(env).any()


def test_adsr_zero_attack_decay_release():
    """Edge case: zero-length segments should not produce NaN."""
    sr = 48000
    adsr = ADSR(
        sr,
        attack_s=0.0,
        decay_s=0.0,
        sustain_level=1.0,
        release_s=0.0,
        hold_s=0.0,
    )
    env = adsr.render(0.1)
    assert env.shape[0] == int(0.1 * sr)
    assert not torch.isnan(env).any() and not torch.isinf(env).any()


# -----------------------------------------------------------------------------
# Legacy Envelope (smoke check)
# -----------------------------------------------------------------------------

def test_envelope_exponential_decay_length():
    env = Envelope.exponential_decay(0.5, 48000, 0.1)
    assert env.shape[0] == int(0.5 * 48000)
    assert not torch.isnan(env).any() and not torch.isinf(env).any()


if __name__ == "__main__":
    test_db_to_lin()
    test_ms_to_s()
    test_clamp01()
    test_adsr_correct_length()
    test_adsr_boundary_approaches_zero_when_release_gt_zero()
    test_adsr_no_nan_inf()
    test_adsr_linear_curve_no_nan_inf()
    test_adsr_gate_none_full_duration()
    test_adsr_zero_attack_decay_release()
    test_envelope_exponential_decay_length()
    print("All envelope tests passed.")
