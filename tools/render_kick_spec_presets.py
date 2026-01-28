"""
Render kick spec presets to WAV files.
Prints resolved params and audio metrics (peak, RMS, low-band ratio).
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
from engine.qc.qc import analyze

# Output directory
OUTPUT_DIR = Path("renders/kick_spec")
DATE_DIR = OUTPUT_DIR / datetime.now().strftime("%Y%m%d")
DATE_DIR.mkdir(parents=True, exist_ok=True)

# Preset file
PRESETS_FILE = Path("presets/kick_spec_presets.json")


def _rms(audio: torch.Tensor) -> float:
    """Compute RMS."""
    return float(torch.sqrt(torch.mean(audio ** 2)))


def _low_band_ratio(audio: torch.Tensor, sample_rate: int) -> float:
    """Compute ratio of 20-100Hz energy to 20-20kHz energy."""
    # Simple approximation: use lowpass at 100Hz vs full bandwidth
    from engine.dsp.filters import Filter
    
    low = Filter.lowpass(audio, sample_rate, 100.0, q=0.707)
    low_energy = torch.sum(low ** 2)
    total_energy = torch.sum(audio ** 2)
    if total_energy < 1e-12:
        return 0.0
    return float(low_energy / total_energy)


def render_preset(preset_name: str, preset_params: dict, seed: int = 42, qc: bool = False):
    """Render a single preset and save WAV."""
    engine = KickEngine(sample_rate=48000)
    
    # Resolve spec params
    spec_implied = resolve_kick_spec_params(preset_params)
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
        resolved = _deep_merge_spec(preset_params, spec_implied)
    else:
        resolved = preset_params
    
    # Render audio
    audio = engine.render(resolved, seed=seed)
    audio_1d = audio.view(-1)  # 1D for QC
    audio = audio.view(1, -1)  # (1, samples) for torchaudio
    
    # Metrics
    peak = float(torch.max(torch.abs(audio)))
    rms = _rms(audio)
    low_ratio = _low_band_ratio(audio.squeeze(), 48000)
    
    # Print resolved params (show key mappings)
    print(f"\n=== {preset_name} ===")
    print(f"Peak: {peak:.4f}, RMS: {rms:.4f}, Low-band ratio: {low_ratio:.3f}")
    
    # QC analysis
    if qc:
        qc_result = analyze(audio_1d, 48000, "kick")
        print(f"QC Status: {qc_result['status']}")
        if qc_result['failures']:
            print("  FAILURES:")
            for f in qc_result['failures']:
                print(f"    - {f}")
        if qc_result['warnings']:
            print("  WARNINGS:")
            for w in qc_result['warnings']:
                print(f"    - {w}")
        if qc_result['status'] == "FAIL":
            return False  # Indicate failure
    print("Resolved params (key mappings):")
    if "kick" in resolved:
        kick = resolved["kick"]
        if "sub" in kick and "amp" in kick["sub"]:
            print(f"  kick.sub.amp.decay_ms: {kick['sub']['amp'].get('decay_ms', 'N/A')}")
        if "click" in kick:
            print(f"  kick.click.gain_db: {kick['click'].get('gain_db', 'N/A')}")
            print(f"  kick.click.filter_hz: {kick['click'].get('filter_hz', 'N/A')}")
            print(f"  kick.click.hardness: {kick['click'].get('hardness', 'N/A')}")
        if "pitch_env" in kick:
            print(f"  kick.pitch_env.semitones: {kick['pitch_env'].get('semitones', 'N/A')}")
            print(f"  kick.pitch_env.decay_ms: {kick['pitch_env'].get('decay_ms', 'N/A')}")
        if "tune" in resolved:
            print(f"  tune: {resolved['tune']}")
    
    # Save WAV
    filename = f"kick_spec_{preset_name.lower().replace(' ', '_')}.wav"
    filepath = DATE_DIR / filename
    torchaudio.save(str(filepath), audio, 48000)
    print(f"Saved: {filepath}\n")


def main():
    """Load presets and render each one."""
    import sys
    
    # Check for qc flag
    qc = "--qc" in sys.argv or "-q" in sys.argv
    
    if not PRESETS_FILE.exists():
        print(f"Error: {PRESETS_FILE} not found")
        return 1
    
    with open(PRESETS_FILE, "r") as f:
        data = json.load(f)
    
    presets = data.get("presets", {})
    if not presets:
        print("No presets found in file")
        return 1
    
    print(f"Rendering {len(presets)} kick spec presets to {DATE_DIR}")
    if qc:
        print("QC analysis enabled")
    
    failures = []
    
    # Render default spec (baseline)
    default_spec = {
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
    if render_preset("Default Spec", default_spec, seed=42, qc=qc) is False:
        failures.append("Default Spec")
    
    # Render each preset
    for preset_name, preset_params in presets.items():
        if render_preset(preset_name, preset_params, seed=42, qc=qc) is False:
            failures.append(preset_name)
    
    print(f"\nAll renders complete. Output directory: {DATE_DIR}")
    
    if failures:
        print(f"\nQC FAILURES in {len(failures)} preset(s): {', '.join(failures)}")
        return 1
    
    return 0


if __name__ == "__main__":
    main()
