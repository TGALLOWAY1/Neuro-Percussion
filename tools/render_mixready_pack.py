"""
Render mix-ready pack: kick/snare/hat defaults + 1 recipe each.
Runs QC analysis and prints report.
"""
import sys
import os
import json
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import torch
import torchaudio

from engine.instruments.kick import KickEngine, resolve_kick_spec_params
from engine.instruments.snare import SnareEngine, resolve_snare_spec_params
from engine.instruments.hat import HatEngine, resolve_hat_spec_params
from engine.qc.qc import analyze

# Output directory
OUTPUT_DIR = Path("renders/mixready_pack")
DATE_DIR = OUTPUT_DIR / datetime.now().strftime("%Y%m%d")
DATE_DIR.mkdir(parents=True, exist_ok=True)

# Preset files
KICK_PRESETS_FILE = Path("presets/kick_spec_presets.json")
SNARE_PRESETS_FILE = Path("presets/snare_spec_presets.json")
HAT_PRESETS_FILE = Path("presets/hat_spec_presets.json")


def _rms(audio: torch.Tensor) -> float:
    """Compute RMS."""
    return float(torch.sqrt(torch.mean(audio ** 2)))


def render_with_qc(engine, params: dict, instrument: str, name: str, seed: int = 42):
    """Render audio and run QC analysis."""
    audio = engine.render(params, seed=seed)
    audio_1d = audio.view(-1)
    audio_2d = audio.view(1, -1)
    
    # Metrics
    peak = float(torch.max(torch.abs(audio)))
    rms = _rms(audio)
    
    # QC analysis
    qc_result = analyze(audio_1d, 48000, instrument)
    
    # Print report
    print(f"\n=== {instrument.upper()}: {name} ===")
    print(f"Peak: {peak:.4f}, RMS: {rms:.4f}")
    print(f"QC Status: {qc_result['status']}")
    if qc_result['failures']:
        print("  FAILURES:")
        for f in qc_result['failures']:
            print(f"    - {f}")
    if qc_result['warnings']:
        print("  WARNINGS:")
        for w in qc_result['warnings']:
            print(f"    - {w}")
    
    # Save WAV
    filename = f"{instrument}_{name.lower().replace(' ', '_')}.wav"
    filepath = DATE_DIR / filename
    torchaudio.save(str(filepath), audio_2d, 48000)
    print(f"Saved: {filepath}")
    
    return qc_result['status'] == "FAIL"


def main():
    """Render mix-ready pack with QC."""
    print(f"Rendering mix-ready pack to {DATE_DIR}")
    print("QC analysis enabled\n")
    
    failures = []
    
    # Helper to resolve spec params
    def resolve_spec(instrument: str, params: dict) -> dict:
        if instrument == "kick":
            spec_implied = resolve_kick_spec_params(params)
        elif instrument == "snare":
            spec_implied = resolve_snare_spec_params(params)
        elif instrument == "hat":
            spec_implied = resolve_hat_spec_params(params)
        else:
            spec_implied = {}
        
        if spec_implied:
            import copy
            def _deep_merge_spec(base: dict, override: dict) -> dict:
                result = copy.deepcopy(base)
                for key, value in override.items():
                    if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                        result[key] = _deep_merge_spec(result[key], value)
                    else:
                        if key not in result:
                            result[key] = copy.deepcopy(value)
                return result
            return _deep_merge_spec(params, spec_implied)
        return params
    
    # Kick: default spec
    kick_default = {
        "kick": {
            "spec": {
                "pitch_hz": 55.0,
                "pitch_env_semitones": 24.0,
                "pitch_decay_ms": 50.0,
                "amp_decay_ms": 350.0,
                "click_level": 0.5,
                "click_attack_ms": 0.5,
                "click_filter_hz": 7000.0,
                "hardness": 0.6,
                "drive_fold": 0.0,
                "eq_scoop_hz": 300.0,
                "eq_scoop_db": -6.0,
                "global_attack_ms": 0.0,
                "comp_ratio": 3.0,
                "comp_attack_ms": 5.0,
                "comp_release_ms": 200.0
            }
        }
    }
    kick_engine = KickEngine(sample_rate=48000)
    kick_resolved = resolve_spec("kick", kick_default)
    if render_with_qc(kick_engine, kick_resolved, "kick", "Default Spec", seed=42):
        failures.append("kick: Default Spec")
    
    # Kick: 1 recipe (Punchy House)
    if KICK_PRESETS_FILE.exists():
        with open(KICK_PRESETS_FILE, "r") as f:
            kick_data = json.load(f)
        kick_presets = kick_data.get("presets", {})
        if "Punchy House" in kick_presets:
            kick_recipe = resolve_spec("kick", kick_presets["Punchy House"])
            if render_with_qc(kick_engine, kick_recipe, "kick", "Punchy House", seed=42):
                failures.append("kick: Punchy House")
    
    # Snare: default spec
    snare_default = {
        "snare": {
            "spec": {
                "tune_hz": 200.0,
                "tone_decay_ms": 150.0,
                "pitch_env_st": 12.0,
                "snare_level": 0.6,
                "noise_decay_ms": 250.0,
                "wire_filter_hz": 5000.0,
                "snap_attack_ms": 1.0,
                "hardness": 0.5,
                "box_cut_db": -6.0,
                "box_cut_hz": 500.0
            }
        }
    }
    snare_engine = SnareEngine(sample_rate=48000)
    snare_resolved = resolve_spec("snare", snare_default)
    if render_with_qc(snare_engine, snare_resolved, "snare", "Default Spec", seed=42):
        failures.append("snare: Default Spec")
    
    # Snare: 1 recipe (Tight Pop Snare)
    if SNARE_PRESETS_FILE.exists():
        with open(SNARE_PRESETS_FILE, "r") as f:
            snare_data = json.load(f)
        snare_presets = snare_data.get("presets", {})
        if "Tight Pop Snare" in snare_presets:
            snare_recipe = resolve_spec("snare", snare_presets["Tight Pop Snare"])
            if render_with_qc(snare_engine, snare_recipe, "snare", "Tight Pop Snare", seed=42):
                failures.append("snare: Tight Pop Snare")
    
    # Hat: default spec
    hat_default = {
        "hat": {
            "spec": {
                "metal_pitch_hz": 800.0,
                "dissonance": 0.7,
                "fm_amount": 0.5,
                "hpf_hz": 3000.0,
                "color_hz": 8000.0,
                "decay_ms": 80.0,
                "choke_group": True,
                "is_open": False,
                "attack_ms": 0.0
            }
        }
    }
    hat_engine = HatEngine(sample_rate=48000)
    hat_resolved = resolve_spec("hat", hat_default)
    if render_with_qc(hat_engine, hat_resolved, "hat", "Default Spec", seed=42):
        failures.append("hat: Default Spec")
    
    # Hat: 1 recipe (Tight Closed Hat)
    if HAT_PRESETS_FILE.exists():
        with open(HAT_PRESETS_FILE, "r") as f:
            hat_data = json.load(f)
        hat_presets = hat_data.get("presets", {})
        if "Tight Closed Hat" in hat_presets:
            hat_recipe = resolve_spec("hat", hat_presets["Tight Closed Hat"])
            if render_with_qc(hat_engine, hat_recipe, "hat", "Tight Closed Hat", seed=42):
                failures.append("hat: Tight Closed Hat")
    
    # Summary
    print(f"\n{'='*60}")
    print("MIX-READY PACK SUMMARY")
    print(f"{'='*60}")
    print(f"Output directory: {DATE_DIR}")
    
    if failures:
        print(f"\nQC FAILURES ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        return 1
    else:
        print("\nAll renders PASSED QC checks!")
        return 0


if __name__ == "__main__":
    sys.exit(main())
