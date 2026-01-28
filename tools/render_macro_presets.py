"""
Renders macro-only presets and shows resolved_params (implied ADSR + layer gains).
Validates that Kick2-style macro controls produce expected advanced params.

Run from project root: python tools/render_macro_presets.py
"""
import sys
import os
import json
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import torch
import torchaudio
from engine.instruments.kick import KickEngine
from engine.instruments.snare import SnareEngine
from engine.instruments.hat import HatEngine
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


def _print_resolved_params(resolved: dict, instrument: str, preset_name: str):
    """Print key resolved params to show macro-to-advanced mapping."""
    print(f"\n  Resolved params for {instrument}/{preset_name}:")
    
    if instrument == "kick":
        click_gain = resolved.get("kick", {}).get("click", {}).get("gain_db", "N/A")
        click_decay = resolved.get("kick", {}).get("click", {}).get("amp", {}).get("decay_ms", "N/A")
        sub_decay = resolved.get("kick", {}).get("sub", {}).get("amp", {}).get("decay_ms", "N/A")
        room_gain = resolved.get("kick", {}).get("room", {}).get("gain_db", "N/A")
        print(f"    click.gain_db={click_gain}, click.amp.decay_ms={click_decay}")
        print(f"    sub.amp.decay_ms={sub_decay}, room.gain_db={room_gain}")
    
    elif instrument == "snare":
        shell_gain = resolved.get("snare", {}).get("shell", {}).get("gain_db", "N/A")
        shell_decay = resolved.get("snare", {}).get("shell", {}).get("amp", {}).get("decay_ms", "N/A")
        wires_gain = resolved.get("snare", {}).get("wires", {}).get("gain_db", "N/A")
        wires_decay = resolved.get("snare", {}).get("wires", {}).get("amp", {}).get("decay_ms", "N/A")
        print(f"    shell.gain_db={shell_gain}, shell.amp.decay_ms={shell_decay}")
        print(f"    wires.gain_db={wires_gain}, wires.amp.decay_ms={wires_decay}")
    
    elif instrument == "hat":
        metal_decay = resolved.get("hat", {}).get("metal", {}).get("amp", {}).get("decay_ms", "N/A")
        air_gain = resolved.get("hat", {}).get("air", {}).get("gain_db", "N/A")
        air_decay = resolved.get("hat", {}).get("air", {}).get("amp", {}).get("decay_ms", "N/A")
        chick_gain = resolved.get("hat", {}).get("chick", {}).get("gain_db", "N/A")
        print(f"    metal.amp.decay_ms={metal_decay}, air.gain_db={air_gain}")
        print(f"    air.amp.decay_ms={air_decay}, chick.gain_db={chick_gain}")


def run():
    # Load presets
    presets_path = os.path.join("presets", "macro_presets.json")
    if not os.path.exists(presets_path):
        print(f"Error: {presets_path} not found")
        return
    
    with open(presets_path, "r") as f:
        presets = json.load(f)
    
    today = datetime.now().strftime("%Y%m%d")
    out_dir = os.path.join("renders", "macro_presets", today)
    _ensure_dir(out_dir)
    print(f"Rendering macro presets -> {out_dir}/")
    print()
    
    # -------------------------------------------------------------------------
    # Kick
    # -------------------------------------------------------------------------
    print("KICK:")
    kick = KickEngine(sample_rate=SR)
    
    for preset_name, preset_params in presets["kick"].items():
        # Resolve params (macros -> implied advanced params)
        resolved = resolve_params("kick", preset_params)
        
        # Render
        audio = kick.render(resolved, seed=SEED)
        filename = f"kick_{preset_name}.wav"
        _save_and_print(out_dir, filename, audio)
        
        # Print resolved params to show macro mapping
        _print_resolved_params(resolved, "kick", preset_name)
    
    print()
    
    # -------------------------------------------------------------------------
    # Snare
    # -------------------------------------------------------------------------
    print("SNARE:")
    snare = SnareEngine(sample_rate=SR)
    
    for preset_name, preset_params in presets["snare"].items():
        resolved = resolve_params("snare", preset_params)
        audio = snare.render(resolved, seed=SEED)
        filename = f"snare_{preset_name}.wav"
        _save_and_print(out_dir, filename, audio)
        _print_resolved_params(resolved, "snare", preset_name)
    
    print()
    
    # -------------------------------------------------------------------------
    # Hat
    # -------------------------------------------------------------------------
    print("HAT:")
    hat = HatEngine(sample_rate=SR)
    
    for preset_name, preset_params in presets["hat"].items():
        resolved = resolve_params("hat", preset_params)
        audio = hat.render(resolved, seed=SEED)
        filename = f"hat_{preset_name}.wav"
        _save_and_print(out_dir, filename, audio)
        _print_resolved_params(resolved, "hat", preset_name)
    
    print()
    print(f"Done. Output in {os.path.abspath(out_dir)}/")


if __name__ == "__main__":
    run()
