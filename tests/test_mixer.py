"""
Tests for engine/dsp/mixer: LayerSpec, LayerMixer gain/mute and stems.
Run from project root: python -m pytest tests/test_mixer.py -v
Or: python tests/test_mixer.py
"""
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import torch
from engine.dsp.mixer import LayerSpec, LayerMixer


# -----------------------------------------------------------------------------
# Gain mapping
# -----------------------------------------------------------------------------

def test_gain_0_db_unchanged():
    """0 dB gain leaves layer level unchanged."""
    mixer = LayerMixer()
    sig = torch.ones(100)
    mixer.add("a", sig)
    params = {}  # no overrides -> default 0 dB
    master, stems = mixer.mix(params, "kick")
    assert master.shape == (100,)
    # 0 dB -> 1.0 linear -> sum should equal input
    torch.testing.assert_close(master, sig)


def test_gain_minus_6_db_reduces():
    """-6 dB halves the level (10^(-6/20) ≈ 0.5)."""
    mixer = LayerMixer()
    sig = torch.ones(100)
    mixer.add("a", sig)
    params = {"kick": {"a": {"gain_db": -6.0}}}
    master, stems = mixer.mix(params, "kick")
    assert master.shape == (100,)
    expected_lin = 10.0 ** (-6.0 / 20.0)
    torch.testing.assert_close(master, sig * expected_lin, atol=1e-5, rtol=1e-5)
    assert float(master[0]) < 1.0


def test_gain_mute_zeroes_layer():
    """Mute param zeroes that layer's contribution."""
    mixer = LayerMixer()
    a = torch.ones(100)
    b = torch.ones(100) * 0.5
    mixer.add("a", a)
    mixer.add("b", b)
    params = {"kick": {"a": {"mute": True}}}
    master, stems = mixer.mix(params, "kick")
    # a muted -> 0; b default 0 dB -> 0.5
    torch.testing.assert_close(master, b)
    assert float(master[0]) == 0.5


def test_mute_all_zeroes_master():
    """All layers muted -> master is zeros."""
    mixer = LayerMixer()
    mixer.add("a", torch.ones(100))
    mixer.add("b", torch.ones(100) * 2.0)
    params = {
        "kick": {
            "a": {"mute": True},
            "b": {"mute": True},
        }
    }
    master, stems = mixer.mix(params, "kick")
    assert master.shape == (100,)
    assert float(torch.sum(torch.abs(master))) == 0.0


# -----------------------------------------------------------------------------
# Optional stems
# -----------------------------------------------------------------------------

def test_debug_stems_returns_stems():
    """When params['debug_stems'] is True, stems dict is non-empty."""
    mixer = LayerMixer()
    mixer.add("layer_a", torch.ones(100))
    mixer.add("layer_b", torch.ones(100) * 2.0)
    params = {"debug_stems": True}
    master, stems = mixer.mix(params, "kick")
    assert "layer_a" in stems
    assert "layer_b" in stems
    assert stems["layer_a"].shape == (100,)
    assert stems["layer_b"].shape == (100,)
    torch.testing.assert_close(master, stems["layer_a"] + stems["layer_b"])


def test_no_debug_stems_empty_stems():
    """When debug_stems is false/absent, stems dict is empty."""
    mixer = LayerMixer()
    mixer.add("a", torch.ones(50))
    master, stems = mixer.mix({}, "snare")
    assert stems == {}


# -----------------------------------------------------------------------------
# LayerSpec
# -----------------------------------------------------------------------------

def test_layer_spec_defaults():
    """LayerSpec holds name, gain_db, mute."""
    spec = LayerSpec("sub", gain_db=-3.0, mute=False)
    assert spec.name == "sub"
    assert spec.gain_db == -3.0
    assert spec.mute is False


if __name__ == "__main__":
    test_gain_0_db_unchanged()
    test_gain_minus_6_db_reduces()
    test_gain_mute_zeroes_layer()
    test_mute_all_zeroes_master()
    test_debug_stems_returns_stems()
    test_no_debug_stems_empty_stems()
    test_layer_spec_defaults()
    print("All mixer tests passed.")
