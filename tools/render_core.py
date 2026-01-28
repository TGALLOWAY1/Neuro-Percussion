"""
Core rendering utilities with debug outputs, fingerprinting, and param tracing.
Used by canonical render.py tool.
"""
import sys
import os
import json
import hashlib
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, Tuple

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import torch
import torchaudio
import numpy as np

from engine.instruments.kick import KickEngine, resolve_kick_spec_params
from engine.instruments.snare import SnareEngine, resolve_snare_spec_params
from engine.instruments.hat import HatEngine, resolve_hat_spec_params
from engine.params.resolve import resolve_params
from engine.params.clamp import clamp_params
from engine.qc.qc import analyze


def _get_git_hash() -> str:
    """Get short git commit hash."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            cwd=os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return "unknown"


def _compute_audio_fingerprint(audio: torch.Tensor) -> Dict:
    """Compute fingerprint: SHA256, peak, RMS, band energies."""
    audio_1d = audio.view(-1).float()
    
    # SHA256 hash of audio bytes
    audio_bytes = audio_1d.numpy().tobytes()
    sha256 = hashlib.sha256(audio_bytes).hexdigest()
    
    # Basic metrics
    peak = float(torch.max(torch.abs(audio_1d)))
    rms = float(torch.sqrt(torch.mean(audio_1d ** 2) + 1e-12))
    
    # Band energies (low/mid/high)
    sample_rate = 48000
    n = len(audio_1d)
    if n < 2:
        return {
            "sha256": sha256,
            "peak": peak,
            "rms": rms,
            "low_energy": 0.0,
            "mid_energy": 0.0,
            "high_energy": 0.0,
        }
    
    n_fft = 2 ** int(np.ceil(np.log2(n)))
    fft = torch.fft.rfft(audio_1d, n=n_fft)
    magnitude = torch.abs(fft)
    freqs = torch.fft.rfftfreq(n_fft, 1.0 / sample_rate)
    
    # Low: 20-200Hz, Mid: 200-5000Hz, High: 5000-24000Hz
    low_mask = (freqs >= 20.0) & (freqs <= 200.0)
    mid_mask = (freqs >= 200.0) & (freqs <= 5000.0)
    high_mask = (freqs >= 5000.0) & (freqs <= sample_rate / 2.0)
    
    low_energy = float(torch.sum(magnitude[low_mask] ** 2))
    mid_energy = float(torch.sum(magnitude[mid_mask] ** 2))
    high_energy = float(torch.sum(magnitude[high_mask] ** 2))
    
    return {
        "sha256": sha256,
        "peak": peak,
        "rms": rms,
        "low_energy": low_energy,
        "mid_energy": mid_energy,
        "high_energy": high_energy,
    }


def _resolve_spec_params(instrument: str, params: dict) -> dict:
    """Apply spec param mapping if spec params exist."""
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


def render_one_shot(
    instrument: str,
    params: dict,
    output_dir: Path,
    filename: str,
    seed: Optional[int] = None,
    debug: bool = False,
    qc: bool = False,
    mode: str = "default",
    script_name: str = "unknown",
) -> Tuple[torch.Tensor, Dict]:
    """
    Render a single one-shot with full param tracing and fingerprinting.
    
    Args:
        instrument: "kick", "snare", or "hat"
        params: Input params dict
        output_dir: Directory to save WAV and debug JSON
        filename: Base filename (without extension)
        seed: Random seed (None = random)
        debug: Enable debug outputs (saves resolved.json)
        qc: Run QC analysis
        mode: "default" or "realistic" (applies clamps)
        script_name: Name of calling script (for debug JSON)
    
    Returns:
        Tuple of (audio_tensor, debug_info_dict)
    """
    # Generate seed if not provided
    if seed is None:
        import random
        seed = random.randint(0, 2**31 - 1)
    
    # Store input params (before any processing)
    input_params = params.copy() if params else {}
    
    # Step 1: Apply spec param mapping if spec params exist
    params_after_spec = _resolve_spec_params(instrument, params)
    
    # Step 2: Apply realistic mode clamps if requested
    if mode == "realistic":
        params_after_clamp = clamp_params(instrument, params_after_spec)
    else:
        params_after_clamp = params_after_spec
    
    # Step 3: Resolve params (deep-merge with defaults, apply macros)
    resolved_params = resolve_params(instrument, params_after_clamp)
    
    # Step 4: Render audio
    if instrument == "kick":
        engine = KickEngine(sample_rate=48000)
    elif instrument == "snare":
        engine = SnareEngine(sample_rate=48000)
    elif instrument == "hat":
        engine = HatEngine(sample_rate=48000)
    else:
        raise ValueError(f"Unknown instrument: {instrument}")
    
    audio = engine.render(resolved_params, seed=seed)
    
    # Ensure audio is 1D
    audio_1d = audio.view(-1).float()
    
    # Step 5: Compute fingerprint
    fingerprint = _compute_audio_fingerprint(audio_1d)
    
    # Step 6: QC analysis (optional)
    qc_result = None
    if qc:
        qc_result = analyze(audio_1d, 48000, instrument)
    
    # Step 7: Save WAV
    output_dir.mkdir(parents=True, exist_ok=True)
    wav_path = output_dir / f"{filename}.wav"
    audio_2d = audio_1d.view(1, -1)
    torchaudio.save(str(wav_path), audio_2d, 48000)
    
    # Step 8: Save debug JSON if enabled
    debug_info = {
        "instrument": instrument,
        "script_name": script_name,
        "timestamp": datetime.now().isoformat(),
        "git_hash": _get_git_hash(),
        "seed": seed,
        "mode": mode,
        "input_params": input_params,
        "params_after_spec": params_after_spec,
        "params_after_clamp": params_after_clamp if mode == "realistic" else None,
        "resolved_params": resolved_params,
        "fingerprint": fingerprint,
        "qc_result": qc_result,
        "wav_path": str(wav_path),
    }
    
    if debug:
        json_path = output_dir / f"{filename}.resolved.json"
        with open(json_path, "w") as f:
            json.dump(debug_info, f, indent=2, default=str)
    
    return audio_1d, debug_info


def get_unique_output_dir(base_name: str) -> Path:
    """
    Generate unique output directory: renders/{base_name}/YYYYMMDD_HHMMSS_{gitshort}/
    """
    now = datetime.now()
    date_str = now.strftime("%Y%m%d")
    time_str = now.strftime("%H%M%S")
    git_hash = _get_git_hash()
    short_hash = git_hash[:8] if git_hash != "unknown" else "unknown"
    
    unique_dir = Path("renders") / base_name / f"{date_str}_{time_str}_{short_hash}"
    return unique_dir
