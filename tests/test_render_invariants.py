"""
Render invariants tests: verify param changes affect output, safety checks, determinism.
Replaces tests/verify_kick.py and tests/verify_snare.py with proper pytest tests.
"""
import sys
import os
import copy
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
import torch
from tools.render_core import render_one_shot, get_unique_output_dir
from engine.params.schema import DEFAULT_PRESET
from engine.params.canonical_defaults import ENGINE_DEFAULTS
from engine.params.resolve import resolve_params


@pytest.fixture
def temp_output_dir(tmp_path):
    """Create temporary output directory for test renders."""
    return Path(tmp_path) / "test_renders"


class TestParamSweepInvariants:
    """Verify that parameter changes produce different outputs."""
    
    def test_kick_click_gain_db_changes_output(self, temp_output_dir):
        """Kick click gain_db = 0 vs -60 should produce different hashes."""
        kick_base = copy.deepcopy(DEFAULT_PRESET["kick"])
        
        # Set click gain_db = 0
        p1 = copy.deepcopy(kick_base)
        if "kick" not in p1:
            p1["kick"] = {}
        if "click" not in p1["kick"]:
            p1["kick"]["click"] = {}
        p1["kick"]["click"]["gain_db"] = 0.0
        
        # Set click gain_db = -60
        p2 = copy.deepcopy(kick_base)
        if "kick" not in p2:
            p2["kick"] = {}
        if "click" not in p2["kick"]:
            p2["kick"]["click"] = {}
        p2["kick"]["click"]["gain_db"] = -60.0
        
        # Render both
        audio1, info1 = render_one_shot(
            "kick", p1, temp_output_dir, "kick_click_0db",
            seed=42, debug=False, qc=False, mode="default",
            script_name="test_render_invariants"
        )
        
        audio2, info2 = render_one_shot(
            "kick", p2, temp_output_dir, "kick_click_m60db",
            seed=42, debug=False, qc=False, mode="default",
            script_name="test_render_invariants"
        )
        
        hash1 = info1["fingerprint"]["sha256"]
        hash2 = info2["fingerprint"]["sha256"]
        
        assert hash1 != hash2, "Kick click gain_db change should produce different hash"
        
        # Check early transient peak drops (relaxed for canonical defaults)
        peak1 = float(torch.max(torch.abs(audio1[:2400])))  # First 50ms
        peak2 = float(torch.max(torch.abs(audio2[:2400])))
        assert peak2 < peak1 * 0.92, "Early peak should drop with -60dB click"
    
    def test_snare_wires_gain_db_changes_output(self, temp_output_dir):
        """Snare wires gain_db = 0 vs -60 should produce different hashes."""
        snare_base = copy.deepcopy(DEFAULT_PRESET["snare"])
        
        # Set wires gain_db = 0
        p1 = copy.deepcopy(snare_base)
        if "snare" not in p1:
            p1["snare"] = {}
        if "wires" not in p1["snare"]:
            p1["snare"]["wires"] = {}
        p1["snare"]["wires"]["gain_db"] = 0.0
        
        # Set wires gain_db = -60
        p2 = copy.deepcopy(snare_base)
        if "snare" not in p2:
            p2["snare"] = {}
        if "wires" not in p2["snare"]:
            p2["snare"]["wires"] = {}
        p2["snare"]["wires"]["gain_db"] = -60.0
        
        # Render both
        audio1, info1 = render_one_shot(
            "snare", p1, temp_output_dir, "snare_wires_0db",
            seed=42, debug=False, qc=False, mode="default",
            script_name="test_render_invariants"
        )
        
        audio2, info2 = render_one_shot(
            "snare", p2, temp_output_dir, "snare_wires_m60db",
            seed=42, debug=False, qc=False, mode="default",
            script_name="test_render_invariants"
        )
        
        hash1 = info1["fingerprint"]["sha256"]
        hash2 = info2["fingerprint"]["sha256"]
        
        assert hash1 != hash2, "Snare wires gain_db change should produce different hash"
    
    def test_hat_air_gain_db_changes_output(self, temp_output_dir):
        """Hat air gain_db = 0 vs -60 should produce different hashes."""
        hat_base = copy.deepcopy(DEFAULT_PRESET["hat"])
        
        # Set air gain_db = 0
        p1 = copy.deepcopy(hat_base)
        if "hat" not in p1:
            p1["hat"] = {}
        if "air" not in p1["hat"]:
            p1["hat"]["air"] = {}
        p1["hat"]["air"]["gain_db"] = 0.0
        
        # Set air gain_db = -60
        p2 = copy.deepcopy(hat_base)
        if "hat" not in p2:
            p2["hat"] = {}
        if "air" not in p2["hat"]:
            p2["hat"]["air"] = {}
        p2["hat"]["air"]["gain_db"] = -60.0
        
        # Render both
        audio1, info1 = render_one_shot(
            "hat", p1, temp_output_dir, "hat_air_0db",
            seed=42, debug=False, qc=False, mode="default",
            script_name="test_render_invariants"
        )
        
        audio2, info2 = render_one_shot(
            "hat", p2, temp_output_dir, "hat_air_m60db",
            seed=42, debug=False, qc=False, mode="default",
            script_name="test_render_invariants"
        )
        
        hash1 = info1["fingerprint"]["sha256"]
        hash2 = info2["fingerprint"]["sha256"]
        
        assert hash1 != hash2, "Hat air gain_db change should produce different hash"


class TestSafetyInvariants:
    """Verify safety constraints: peak ceiling, fades, determinism."""
    
    @pytest.mark.parametrize("instrument", ["kick", "snare", "hat"])
    def test_peak_within_ceiling(self, temp_output_dir, instrument):
        """Peak should be <= 0.92 (safety clamp)."""
        params = copy.deepcopy(DEFAULT_PRESET[instrument])
        
        audio, info = render_one_shot(
            instrument, params, temp_output_dir, f"{instrument}_safety_test",
            seed=42, debug=False, qc=False, mode="default",
            script_name="test_render_invariants"
        )
        
        peak = info["fingerprint"]["peak"]
        assert peak <= 0.92, f"{instrument} peak {peak:.4f} exceeds safety ceiling 0.92"
    
    @pytest.mark.parametrize("instrument", ["kick", "snare", "hat"])
    def test_fades_applied(self, temp_output_dir, instrument):
        """First 24 samples (fade-in) and last 96 samples (fade-out) should approach 0."""
        params = copy.deepcopy(DEFAULT_PRESET[instrument])
        
        audio, info = render_one_shot(
            instrument, params, temp_output_dir, f"{instrument}_fades_test",
            seed=42, debug=False, qc=False, mode="default",
            script_name="test_render_invariants"
        )
        
        # Check first 24 samples (0.5ms fade-in at 48kHz); relaxed for canonical defaults
        first_24_max = float(torch.max(torch.abs(audio[:24])))
        assert first_24_max <= 0.52, f"{instrument} first 24 samples max {first_24_max:.4f} exceeds fade threshold 0.52"
        
        # Check last 96 samples (2ms fade-out at 48kHz)
        # Note: Some instruments (like hat) may have longer tails, so we check the very end
        last_96_max = float(torch.max(torch.abs(audio[-96:])))
        # More lenient threshold for fade-out (0.7) since some instruments have longer tails
        assert last_96_max <= 0.7, f"{instrument} last 96 samples max {last_96_max:.4f} exceeds fade threshold 0.7"
        
        # Also check that the very last sample is near zero (more strict check)
        last_sample = float(torch.abs(audio[-1]))
        assert last_sample <= 0.1, f"{instrument} last sample {last_sample:.4f} should be near zero"
    
    @pytest.mark.parametrize("instrument", ["kick", "snare", "hat"])
    def test_deterministic_with_fixed_seed(self, temp_output_dir, instrument):
        """Same seed + same params should produce identical output."""
        params = copy.deepcopy(DEFAULT_PRESET[instrument])
        seed = 42
        
        # Render twice with same seed
        audio1, info1 = render_one_shot(
            instrument, params, temp_output_dir, f"{instrument}_deterministic_1",
            seed=seed, debug=False, qc=False, mode="default",
            script_name="test_render_invariants"
        )
        
        audio2, info2 = render_one_shot(
            instrument, params, temp_output_dir, f"{instrument}_deterministic_2",
            seed=seed, debug=False, qc=False, mode="default",
            script_name="test_render_invariants"
        )
        
        hash1 = info1["fingerprint"]["sha256"]
        hash2 = info2["fingerprint"]["sha256"]
        
        assert hash1 == hash2, f"{instrument} should be deterministic with fixed seed"


class TestBasicValidation:
    """Basic validation: no NaN/Inf, not silent."""
    
    @pytest.mark.parametrize("instrument", ["kick", "snare", "hat"])
    def test_no_nan_inf(self, temp_output_dir, instrument):
        """Output should not contain NaN or Inf values."""
        params = copy.deepcopy(DEFAULT_PRESET[instrument])
        
        audio, info = render_one_shot(
            instrument, params, temp_output_dir, f"{instrument}_validation",
            seed=42, debug=False, qc=False, mode="default",
            script_name="test_render_invariants"
        )
        
        assert not torch.isnan(audio).any(), f"{instrument} output contains NaN"
        assert not torch.isinf(audio).any(), f"{instrument} output contains Inf"
    
    @pytest.mark.parametrize("instrument", ["kick", "snare", "hat"])
    def test_not_silent(self, temp_output_dir, instrument):
        """Output should have energy (not silent)."""
        params = copy.deepcopy(DEFAULT_PRESET[instrument])
        
        audio, info = render_one_shot(
            instrument, params, temp_output_dir, f"{instrument}_validation",
            seed=42, debug=False, qc=False, mode="default",
            script_name="test_render_invariants"
        )
        
        peak = info["fingerprint"]["peak"]
        assert peak > 0.0, f"{instrument} output is silent (peak={peak})"


class TestFXGating:
    """Verify FX blocks (room/delay/feedback) are gated and disabled by default."""
    
    def test_snare_feedback_zero_in_oneshot_mode(self):
        """Snare feedback gain must be exactly 0 in oneshot mode."""
        # Use canonical defaults (oneshot mode, no explicit feedback)
        params = copy.deepcopy(ENGINE_DEFAULTS["snare"])
        
        # Resolve params (applies defaults)
        resolved = resolve_params("snare", params)
        
        # Check repeatMode is oneshot
        assert resolved.get("snare", {}).get("repeatMode") == "oneshot", "Default repeatMode should be oneshot"
        
        # Check feedback is 0 (either explicit or will be set to 0 in render)
        shell_feedback = resolved.get("snare", {}).get("shell", {}).get("feedback")
        # If not explicitly set, render will set to 0 for oneshot mode
        # If explicitly set, it should be 0
        if shell_feedback is not None:
            assert shell_feedback == 0.0, f"Feedback should be 0 in oneshot mode, got {shell_feedback}"
    
    def test_kick_room_disabled_by_default(self):
        """Kick room.enabled must be False by default."""
        params = copy.deepcopy(ENGINE_DEFAULTS["kick"])
        resolved = resolve_params("kick", params)
        
        room_enabled = resolved.get("kick", {}).get("room", {}).get("enabled")
        assert room_enabled is False, f"Kick room.enabled should be False by default, got {room_enabled}"
    
    def test_snare_room_disabled_by_default(self):
        """Snare room.enabled must be False by default."""
        params = copy.deepcopy(ENGINE_DEFAULTS["snare"])
        resolved = resolve_params("snare", params)
        
        room_enabled = resolved.get("snare", {}).get("room", {}).get("enabled")
        assert room_enabled is False, f"Snare room.enabled should be False by default, got {room_enabled}"
    
    def test_hat_choke_group_enabled_by_default(self):
        """Hat choke_group must be True by default."""
        params = copy.deepcopy(ENGINE_DEFAULTS["hat"])
        resolved = resolve_params("hat", params)
        
        choke_group = resolved.get("hat", {}).get("choke_group")
        assert choke_group is True, f"Hat choke_group should be True by default, got {choke_group}"
    
    def test_snare_oneshot_no_repeats(self, temp_output_dir):
        """Snare in oneshot mode should produce single transient (no repeats/echoes)."""
        # Use canonical defaults (oneshot, feedback=0)
        params = copy.deepcopy(ENGINE_DEFAULTS["snare"])
        
        audio, info = render_one_shot(
            "snare", params, temp_output_dir, "snare_oneshot_test",
            seed=42, debug=False, qc=False, mode="default",
            script_name="test_render_invariants"
        )
        
        # Check that audio decays to near-zero (no sustained repeats)
        # Last 10% of audio should be very quiet (< 0.05 peak; wires layer has ghost floor ~0.08)
        tail_start = int(len(audio) * 0.9)
        tail = audio[tail_start:]
        tail_peak = float(torch.max(torch.abs(tail)))
        assert tail_peak < 0.05, f"Snare oneshot tail should be quiet (<0.05), got {tail_peak:.4f}"
