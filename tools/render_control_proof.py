"""
Renders control proof WAVs: baseline + ADSR variants + fader variants.
Demonstrates that ADSR and per-layer faders are working.
Saves to renders/control_proof/YYYYMMDD/.

Run from project root: python tools/render_control_proof.py
"""
import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import torch
import torchaudio
from engine.instruments.kick import KickEngine
from engine.instruments.snare import SnareEngine
from engine.instruments.hat import HatEngine
from engine.params.schema import DEFAULT_PRESET
from engine.params.resolve import resolve_params


SR = 48000
SEED = 42


def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def _peak_rms(audio: torch.Tensor) -> tuple[float, float]:
    """Return (peak, rms) for audio tensor."""
    peak = float(torch.max(torch.abs(audio)))
    rms = float(torch.sqrt(torch.mean(audio ** 2) + 1e-12))
    return peak, rms


def _save_and_print(out_dir: str, name: str, audio: torch.Tensor) -> str:
    """Save WAV and print stats."""
    path = os.path.join(out_dir, name)
    torchaudio.save(path, audio.unsqueeze(0), SR)
    peak, rms = _peak_rms(audio)
    print(f"  {name:40s}  peak={peak:.4f}  rms={rms:.4f}")
    return path


def _deep_set(d: dict, keys: list[str], value: float) -> dict:
    """Set nested dict value. Returns new dict (does not mutate input)."""
    import copy
    result = copy.deepcopy(d)
    current = result
    for key in keys[:-1]:
        if key not in current:
            current[key] = {}
        elif not isinstance(current[key], dict):
            current[key] = {}
        else:
            # Deep copy nested dict to avoid mutation
            current[key] = copy.deepcopy(current[key])
        current = current[key]
    current[keys[-1]] = value
    return result


def run():
    today = datetime.now().strftime("%Y%m%d")
    out_dir = os.path.join("renders", "control_proof", today)
    _ensure_dir(out_dir)
    print(f"Rendering control proof -> {out_dir}/")
    print()

    # -------------------------------------------------------------------------
    # Kick
    # -------------------------------------------------------------------------
    print("KICK:")
    kick = KickEngine(sample_rate=SR)
    kick_base = DEFAULT_PRESET["kick"]

    # Baseline
    resolved = resolve_params("kick", kick_base)
    audio = kick.render(resolved, seed=SEED)
    _save_and_print(out_dir, "kick_baseline.wav", audio)

    # ADSR proof: click decay_ms = 2 vs 40
    p1 = _deep_set(kick_base, ["kick", "click", "amp", "decay_ms"], 2.0)
    resolved = resolve_params("kick", p1)
    audio = kick.render(resolved, seed=SEED)
    _save_and_print(out_dir, "kick_click_decay_2ms.wav", audio)

    p2 = _deep_set(kick_base, ["kick", "click", "amp", "decay_ms"], 40.0)
    resolved = resolve_params("kick", p2)
    audio = kick.render(resolved, seed=SEED)
    _save_and_print(out_dir, "kick_click_decay_40ms.wav", audio)

    # Fader proof: click gain_db = -60
    p3 = _deep_set(kick_base, ["kick", "click", "gain_db"], -60.0)
    resolved = resolve_params("kick", p3)
    audio = kick.render(resolved, seed=SEED)
    _save_and_print(out_dir, "kick_click_gain_m60db.wav", audio)

    print()

    # -------------------------------------------------------------------------
    # Snare
    # -------------------------------------------------------------------------
    print("SNARE:")
    snare = SnareEngine(sample_rate=SR)
    snare_base = DEFAULT_PRESET["snare"]

    # Baseline
    resolved = resolve_params("snare", snare_base)
    audio = snare.render(resolved, seed=SEED)
    _save_and_print(out_dir, "snare_baseline.wav", audio)

    # ADSR proof: wires decay_ms = 60 vs 220
    p1 = _deep_set(snare_base, ["snare", "wires", "amp", "decay_ms"], 60.0)
    resolved = resolve_params("snare", p1)
    audio = snare.render(resolved, seed=SEED)
    _save_and_print(out_dir, "snare_wires_decay_60ms.wav", audio)

    p2 = _deep_set(snare_base, ["snare", "wires", "amp", "decay_ms"], 220.0)
    resolved = resolve_params("snare", p2)
    audio = snare.render(resolved, seed=SEED)
    _save_and_print(out_dir, "snare_wires_decay_220ms.wav", audio)

    # Fader proof: wires gain_db = -60
    p3 = _deep_set(snare_base, ["snare", "wires", "gain_db"], -60.0)
    resolved = resolve_params("snare", p3)
    audio = snare.render(resolved, seed=SEED)
    _save_and_print(out_dir, "snare_wires_gain_m60db.wav", audio)

    print()

    # -------------------------------------------------------------------------
    # Hat
    # -------------------------------------------------------------------------
    print("HAT:")
    hat = HatEngine(sample_rate=SR)
    hat_base = DEFAULT_PRESET["hat"]

    # Baseline
    resolved = resolve_params("hat", hat_base)
    audio = hat.render(resolved, seed=SEED)
    _save_and_print(out_dir, "hat_baseline.wav", audio)

    # ADSR proof: air decay_ms = 20 vs 80
    p1 = _deep_set(hat_base, ["hat", "air", "amp", "decay_ms"], 20.0)
    resolved = resolve_params("hat", p1)
    audio = hat.render(resolved, seed=SEED)
    _save_and_print(out_dir, "hat_air_decay_20ms.wav", audio)

    p2 = _deep_set(hat_base, ["hat", "air", "amp", "decay_ms"], 80.0)
    resolved = resolve_params("hat", p2)
    audio = hat.render(resolved, seed=SEED)
    _save_and_print(out_dir, "hat_air_decay_80ms.wav", audio)

    # Fader proof: air gain_db = -60
    p3 = _deep_set(hat_base, ["hat", "air", "gain_db"], -60.0)
    resolved = resolve_params("hat", p3)
    audio = hat.render(resolved, seed=SEED)
    _save_and_print(out_dir, "hat_air_gain_m60db.wav", audio)

    print()
    print(f"Done. Output in {os.path.abspath(out_dir)}/")


if __name__ == "__main__":
    run()
