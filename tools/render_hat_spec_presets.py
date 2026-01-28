"""
Render hat spec presets to WAV files.
Prints resolved params and audio metrics (peak, RMS, centroid, % energy below 3kHz).
Includes choke group demo: open hat then closed hat (closed cuts open).
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

from engine.instruments.hat import HatEngine, resolve_hat_spec_params
from engine.qc.qc import analyze

# Output directory
OUTPUT_DIR = Path("renders/hat_spec")
DATE_DIR = OUTPUT_DIR / datetime.now().strftime("%Y%m%d")
DATE_DIR.mkdir(parents=True, exist_ok=True)

# Preset file
PRESETS_FILE = Path("presets/hat_spec_presets.json")


def _rms(audio: torch.Tensor) -> float:
    """Compute RMS."""
    return float(torch.sqrt(torch.mean(audio ** 2)))


def _spectral_centroid(audio: torch.Tensor, sample_rate: int) -> float:
    """Compute spectral centroid in Hz."""
    n = len(audio)
    if n < 2:
        return 0.0
    
    n_fft = 2 ** int(np.ceil(np.log2(n)))
    fft = torch.fft.rfft(audio, n=n_fft)
    magnitude = torch.abs(fft)
    
    freqs = torch.fft.rfftfreq(n_fft, 1.0 / sample_rate)
    
    total_mag = torch.sum(magnitude)
    if total_mag < 1e-12:
        return 0.0
    
    centroid = torch.sum(freqs * magnitude) / total_mag
    return float(centroid)


def _energy_below_hz(audio: torch.Tensor, sample_rate: int, cutoff_hz: float) -> float:
    """Compute % energy below cutoff_hz."""
    n = len(audio)
    if n < 2:
        return 0.0
    
    n_fft = 2 ** int(np.ceil(np.log2(n)))
    fft = torch.fft.rfft(audio, n=n_fft)
    magnitude = torch.abs(fft)
    
    freqs = torch.fft.rfftfreq(n_fft, 1.0 / sample_rate)
    
    # Energy below cutoff
    mask_below = freqs <= cutoff_hz
    energy_below = torch.sum(magnitude[mask_below] ** 2)
    
    # Total energy
    total_energy = torch.sum(magnitude ** 2)
    
    if total_energy < 1e-12:
        return 0.0
    
    return float(energy_below / total_energy) * 100.0


def render_preset(preset_name: str, preset_params: dict, seed: int = 42, qc: bool = False):
    """Render a single preset and save WAV."""
    engine = HatEngine(sample_rate=48000)
    
    # Resolve spec params
    spec_implied = resolve_hat_spec_params(preset_params)
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
    centroid = _spectral_centroid(audio.squeeze(), 48000)
    energy_below_3k = _energy_below_hz(audio.squeeze(), 48000, 3000.0)
    
    # Print resolved params (show key mappings)
    print(f"\n=== {preset_name} ===")
    print(f"Peak: {peak:.4f}, RMS: {rms:.4f}, Centroid: {centroid:.1f} Hz, Energy below 3kHz: {energy_below_3k:.1f}%")
    
    # QC analysis
    if qc:
        qc_result = analyze(audio_1d, 48000, "hat")
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
    if "hat" in resolved:
        hat = resolved["hat"]
        if "metal" in hat:
            if "base_hz" in hat["metal"]:
                print(f"  hat.metal.base_hz: {hat['metal'].get('base_hz', 'N/A')}")
            if "ratio_jitter" in hat["metal"]:
                print(f"  hat.metal.ratio_jitter: {hat['metal'].get('ratio_jitter', 'N/A')}")
            if "amp" in hat["metal"]:
                print(f"  hat.metal.amp.decay_ms: {hat['metal']['amp'].get('decay_ms', 'N/A')}")
                print(f"  hat.metal.amp.attack_ms: {hat['metal']['amp'].get('attack_ms', 'N/A')}")
        if "hpf_hz" in hat:
            print(f"  hat.hpf_hz: {hat.get('hpf_hz', 'N/A')}")
        if "color_hz" in hat:
            print(f"  hat.color_hz: {hat.get('color_hz', 'N/A')}")
        if "is_open" in hat:
            print(f"  hat.is_open: {hat.get('is_open', 'N/A')}")
        if "choke_group" in hat:
            print(f"  hat.choke_group: {hat.get('choke_group', 'N/A')}")
        if "dirt" in resolved:
            print(f"  dirt (from fm_amount): {resolved.get('dirt', 'N/A')}")
    
    # Save WAV
    filename = f"hat_spec_{preset_name.lower().replace(' ', '_')}.wav"
    filepath = DATE_DIR / filename
    torchaudio.save(str(filepath), audio, 48000)
    print(f"Saved: {filepath}\n")


def render_choke_demo():
    """Render a 2-bar pattern demonstrating choke: open hat then closed hat (closed cuts open)."""
    engine = HatEngine(sample_rate=48000)
    
    # Open hat preset
    open_params = {
        "hat": {
            "spec": {
                "metal_pitch_hz": 800.0,
                "dissonance": 0.7,
                "fm_amount": 0.4,
                "hpf_hz": 3000.0,
                "color_hz": 8000.0,
                "decay_ms": 800.0,
                "choke_group": True,
                "is_open": True,
                "attack_ms": 5.0
            }
        }
    }
    
    # Closed hat preset
    closed_params = {
        "hat": {
            "spec": {
                "metal_pitch_hz": 1000.0,
                "dissonance": 0.5,
                "fm_amount": 0.3,
                "hpf_hz": 4000.0,
                "color_hz": 10000.0,
                "decay_ms": 50.0,
                "choke_group": True,
                "is_open": False,
                "attack_ms": 0.0
            }
        }
    }
    
    # Render both
    open_audio = engine.render(open_params, seed=42)
    closed_audio = engine.render(closed_params, seed=43)
    
    # Create 2-bar pattern: open hat at beat 1, closed hat at beat 3 (chokes open)
    # 2 bars = 4 beats at 120 BPM = 4 seconds
    sample_rate = 48000
    pattern_length = int(4.0 * sample_rate)
    pattern = torch.zeros(pattern_length, dtype=torch.float32)
    
    # Beat 1: open hat (start at 0)
    open_start = 0
    open_end = min(open_start + len(open_audio), pattern_length)
    pattern[open_start:open_end] = open_audio[:open_end - open_start]
    
    # Beat 3: closed hat (starts at 2 seconds = 96000 samples)
    # This should cut off the open hat tail (choke behavior)
    closed_start = int(2.0 * sample_rate)
    closed_end = min(closed_start + len(closed_audio), pattern_length)
    
    # Apply choke: zero out open hat tail before closed hat starts
    # Find where open hat energy drops below threshold (simple approach)
    open_tail_start = open_start + len(open_audio)
    if open_tail_start > closed_start:
        # Zero out the overlap region (open hat tail gets cut)
        pattern[closed_start:open_tail_start] = 0.0
    
    # Place closed hat
    pattern[closed_start:closed_end] = closed_audio[:closed_end - closed_start]
    
    # Save pattern
    pattern = pattern.view(1, -1)
    filename = "hat_spec_choke_demo.wav"
    filepath = DATE_DIR / filename
    torchaudio.save(str(filepath), pattern, sample_rate)
    
    print(f"\n=== Choke Demo (Open -> Closed) ===")
    print(f"Pattern: Open hat at beat 1, Closed hat at beat 3 (cuts open tail)")
    print(f"Length: 4 seconds (2 bars @ 120 BPM)")
    print(f"Saved: {filepath}\n")


def main():
    """Load presets and render each one, plus choke demo."""
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
    
    print(f"Rendering {len(presets)} hat spec presets to {DATE_DIR}")
    if qc:
        print("QC analysis enabled")
    
    failures = []
    
    # Render default spec (baseline)
    default_spec = {
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
    if render_preset("Default Spec", default_spec, seed=42, qc=qc) is False:
        failures.append("Default Spec")
    
    # Render each preset
    for preset_name, preset_params in presets.items():
        if render_preset(preset_name, preset_params, seed=42, qc=qc) is False:
            failures.append(preset_name)
    
    # Render choke demo (no QC for demo)
    render_choke_demo()
    
    print(f"\nAll renders complete. Output directory: {DATE_DIR}")
    
    if failures:
        print(f"\nQC FAILURES in {len(failures)} preset(s): {', '.join(failures)}")
        return 1
    
    return 0


if __name__ == "__main__":
    main()
