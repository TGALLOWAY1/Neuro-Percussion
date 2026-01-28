"""
Render snare spec presets to WAV files.
Prints resolved params and audio metrics (peak, RMS, centroid, energy ratio).
"""
import sys
import os
import json
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import torch
import torchaudio
import numpy as np

from engine.instruments.snare import SnareEngine, resolve_snare_spec_params

# Output directory
OUTPUT_DIR = Path("renders/snare_spec")
DATE_DIR = OUTPUT_DIR / datetime.now().strftime("%Y%m%d")
DATE_DIR.mkdir(parents=True, exist_ok=True)

# Preset file
PRESETS_FILE = Path("presets/snare_spec_presets.json")


def _rms(audio: torch.Tensor) -> float:
    """Compute RMS."""
    return float(torch.sqrt(torch.mean(audio ** 2)))


def _spectral_centroid(audio: torch.Tensor, sample_rate: int) -> float:
    """Compute spectral centroid in Hz."""
    # Simple approximation: use FFT
    n = len(audio)
    if n < 2:
        return 0.0
    
    # Zero-pad to power of 2
    n_fft = 2 ** int(np.ceil(np.log2(n)))
    fft = torch.fft.rfft(audio, n=n_fft)
    magnitude = torch.abs(fft)
    
    # Frequency bins
    freqs = torch.fft.rfftfreq(n_fft, 1.0 / sample_rate)
    
    # Centroid: sum(freq * magnitude) / sum(magnitude)
    total_mag = torch.sum(magnitude)
    if total_mag < 1e-12:
        return 0.0
    
    centroid = torch.sum(freqs * magnitude) / total_mag
    return float(centroid)


def _energy_ratio(audio: torch.Tensor, sample_rate: int, low_hz: float, high_hz: float, band_low: float, band_high: float) -> float:
    """Compute energy ratio: band_low-band_high Hz vs low_hz-high_hz Hz."""
    n = len(audio)
    if n < 2:
        return 0.0
    
    n_fft = 2 ** int(np.ceil(np.log2(n)))
    fft = torch.fft.rfft(audio, n=n_fft)
    magnitude = torch.abs(fft)
    
    freqs = torch.fft.rfftfreq(n_fft, 1.0 / sample_rate)
    
    # Energy in low band (150-250Hz)
    mask_low = (freqs >= band_low) & (freqs <= band_high)
    energy_low = torch.sum(magnitude[mask_low] ** 2)
    
    # Energy in high band (300-600Hz)
    mask_high = (freqs >= low_hz) & (freqs <= high_hz)
    energy_high = torch.sum(magnitude[mask_high] ** 2)
    
    if energy_high < 1e-12:
        return 0.0
    
    return float(energy_low / energy_high)


def render_preset(preset_name: str, preset_params: dict, seed: int = 42):
    """Render a single preset and save WAV."""
    engine = SnareEngine(sample_rate=48000)
    
    # Resolve spec params
    spec_implied = resolve_snare_spec_params(preset_params)
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
    audio = audio.view(1, -1)  # (1, samples) for torchaudio
    
    # Metrics
    peak = float(torch.max(torch.abs(audio)))
    rms = _rms(audio)
    centroid = _spectral_centroid(audio.squeeze(), 48000)
    energy_ratio = _energy_ratio(audio.squeeze(), 48000, 300.0, 600.0, 150.0, 250.0)
    
    # Print resolved params (show key mappings)
    print(f"\n=== {preset_name} ===")
    print(f"Peak: {peak:.4f}, RMS: {rms:.4f}, Centroid: {centroid:.1f} Hz, Energy ratio (150-250Hz / 300-600Hz): {energy_ratio:.3f}")
    print("Resolved params (key mappings):")
    if "snare" in resolved:
        snare = resolved["snare"]
        if "shell" in snare:
            if "amp" in snare["shell"]:
                print(f"  snare.shell.amp.decay_ms: {snare['shell']['amp'].get('decay_ms', 'N/A')}")
            if "pitch_hz" in snare["shell"]:
                print(f"  snare.shell.pitch_hz: {snare['shell'].get('pitch_hz', 'N/A')}")
            if "pitch_env_st" in snare["shell"]:
                print(f"  snare.shell.pitch_env_st: {snare['shell'].get('pitch_env_st', 'N/A')}")
        if "wires" in snare:
            print(f"  snare.wires.gain_db: {snare['wires'].get('gain_db', 'N/A')}")
            print(f"  snare.wires.filter_hz: {snare['wires'].get('filter_hz', 'N/A')}")
            if "amp" in snare["wires"]:
                print(f"  snare.wires.amp.decay_ms: {snare['wires']['amp'].get('decay_ms', 'N/A')}")
        if "snap" in snare:
            print(f"  snare.snap.hardness: {snare['snap'].get('hardness', 'N/A')}")
        if "box_cut" in snare:
            print(f"  snare.box_cut.hz: {snare['box_cut'].get('hz', 'N/A')}")
            print(f"  snare.box_cut.db: {snare['box_cut'].get('db', 'N/A')}")
    
    # Save WAV
    filename = f"snare_spec_{preset_name.lower().replace(' ', '_').replace('&', 'and')}.wav"
    filepath = DATE_DIR / filename
    torchaudio.save(str(filepath), audio, 48000)
    print(f"Saved: {filepath}\n")


def main():
    """Load presets and render each one."""
    if not PRESETS_FILE.exists():
        print(f"Error: {PRESETS_FILE} not found")
        return
    
    with open(PRESETS_FILE, "r") as f:
        data = json.load(f)
    
    presets = data.get("presets", {})
    if not presets:
        print("No presets found in file")
        return
    
    print(f"Rendering {len(presets)} snare spec presets to {DATE_DIR}")
    
    # Render default spec (baseline)
    default_spec = {
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
    render_preset("Default Spec", default_spec, seed=42)
    
    # Render each preset
    for preset_name, preset_params in presets.items():
        render_preset(preset_name, preset_params, seed=42)
    
    print(f"\nAll renders complete. Output directory: {DATE_DIR}")


if __name__ == "__main__":
    main()
