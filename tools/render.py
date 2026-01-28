#!/usr/bin/env python3
"""
Canonical renderer tool with debug outputs, fingerprinting, and param tracing.
Consolidates all render scripts into one tool with subcommands.

Usage:
    python tools/render.py <subcommand> [options]

Subcommands:
    one-shot <instrument> <params_json>     Render a single one-shot
    preset-pack                              Render mix-ready pack (kick/snare/hat defaults + recipes)
    spec-recipes <instrument>                Render spec recipe presets
    control-proof                            Render control proof (ADSR + fader variants)
    param-sweep                              Run param sweep tests to catch no-op renders

Options:
    --seed <int>         Fixed seed (default: random)
    --debug               Save resolved.json with param trace
    --qc                  Run QC analysis
    --mode <str>          "default" or "realistic" (default: default)
    --output-dir <path>   Output directory (default: unique timestamped dir)
"""
import sys
import os
import json
import argparse
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import torch

from tools.render_core import render_one_shot, get_unique_output_dir
from engine.params.schema import DEFAULT_PRESET
from engine.params.resolve import resolve_params


def cmd_one_shot(args):
    """Render a single one-shot."""
    # Load params from JSON file or use empty dict
    if args.params_json:
        with open(args.params_json, "r") as f:
            params = json.load(f)
    else:
        params = {}
    
    # Determine output directory
    if args.output_dir:
        output_dir = Path(args.output_dir)
    else:
        output_dir = get_unique_output_dir("one_shot")
    
    filename = args.filename or f"{args.instrument}_oneshot"
    
    # Render
    audio, debug_info = render_one_shot(
        instrument=args.instrument,
        params=params,
        output_dir=output_dir,
        filename=filename,
        seed=args.seed,
        debug=args.debug,
        qc=args.qc,
        mode=args.mode,
        script_name="render.py one-shot",
    )
    
    # Print summary
    print(f"\n=== Render Complete ===")
    print(f"Instrument: {args.instrument}")
    print(f"Output: {debug_info['wav_path']}")
    print(f"Seed: {debug_info['seed']}")
    print(f"Fingerprint SHA256: {debug_info['fingerprint']['sha256'][:16]}...")
    print(f"Peak: {debug_info['fingerprint']['peak']:.4f}, RMS: {debug_info['fingerprint']['rms']:.4f}")
    
    if args.debug:
        json_path = output_dir / f"{filename}.resolved.json"
        print(f"Debug JSON: {json_path}")
    
    if args.qc and debug_info.get('qc_result'):
        qc = debug_info['qc_result']
        print(f"QC Status: {qc['status']}")
        if qc['failures']:
            print("  FAILURES:")
            for f in qc['failures']:
                print(f"    - {f}")
        if qc['warnings']:
            print("  WARNINGS:")
            for w in qc['warnings']:
                print(f"    - {w}")
    
    return 0


def cmd_preset_pack(args):
    """Render mix-ready pack: kick/snare/hat defaults + 1 recipe each."""
    output_dir = args.output_dir or get_unique_output_dir("mixready_pack")
    
    print(f"Rendering mix-ready pack to {output_dir}")
    if args.debug:
        print("Debug mode enabled (saving resolved.json)")
    if args.qc:
        print("QC analysis enabled")
    
    failures = []
    
    # Helper to resolve spec params
    def resolve_spec(instrument: str, params: dict) -> dict:
        from engine.instruments.kick import resolve_kick_spec_params
        from engine.instruments.snare import resolve_snare_spec_params
        from engine.instruments.hat import resolve_hat_spec_params
        
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
    kick_resolved = resolve_spec("kick", kick_default)
    _, debug_info = render_one_shot(
        "kick", kick_resolved, output_dir, "kick_default_spec",
        seed=args.seed, debug=args.debug, qc=args.qc, mode=args.mode,
        script_name="render.py preset-pack"
    )
    if args.qc and debug_info.get('qc_result', {}).get('status') == "FAIL":
        failures.append("kick: Default Spec")
    
    # Kick: 1 recipe (Punchy House)
    kick_presets_file = Path("presets/kick_spec_presets.json")
    if kick_presets_file.exists():
        with open(kick_presets_file, "r") as f:
            kick_data = json.load(f)
        kick_presets = kick_data.get("presets", {})
        if "Punchy House" in kick_presets:
            kick_recipe = resolve_spec("kick", kick_presets["Punchy House"])
            _, debug_info = render_one_shot(
                "kick", kick_recipe, output_dir, "kick_punchy_house",
                seed=args.seed, debug=args.debug, qc=args.qc, mode=args.mode,
                script_name="render.py preset-pack"
            )
            if args.qc and debug_info.get('qc_result', {}).get('status') == "FAIL":
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
    snare_resolved = resolve_spec("snare", snare_default)
    _, debug_info = render_one_shot(
        "snare", snare_resolved, output_dir, "snare_default_spec",
        seed=args.seed, debug=args.debug, qc=args.qc, mode=args.mode,
        script_name="render.py preset-pack"
    )
    if args.qc and debug_info.get('qc_result', {}).get('status') == "FAIL":
        failures.append("snare: Default Spec")
    
    # Snare: 1 recipe (Tight Pop Snare)
    snare_presets_file = Path("presets/snare_spec_presets.json")
    if snare_presets_file.exists():
        with open(snare_presets_file, "r") as f:
            snare_data = json.load(f)
        snare_presets = snare_data.get("presets", {})
        if "Tight Pop Snare" in snare_presets:
            snare_recipe = resolve_spec("snare", snare_presets["Tight Pop Snare"])
            _, debug_info = render_one_shot(
                "snare", snare_recipe, output_dir, "snare_tight_pop_snare",
                seed=args.seed, debug=args.debug, qc=args.qc, mode=args.mode,
                script_name="render.py preset-pack"
            )
            if args.qc and debug_info.get('qc_result', {}).get('status') == "FAIL":
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
    hat_resolved = resolve_spec("hat", hat_default)
    _, debug_info = render_one_shot(
        "hat", hat_resolved, output_dir, "hat_default_spec",
        seed=args.seed, debug=args.debug, qc=args.qc, mode=args.mode,
        script_name="render.py preset-pack"
    )
    if args.qc and debug_info.get('qc_result', {}).get('status') == "FAIL":
        failures.append("hat: Default Spec")
    
    # Hat: 1 recipe (Tight Closed Hat)
    hat_presets_file = Path("presets/hat_spec_presets.json")
    if hat_presets_file.exists():
        with open(hat_presets_file, "r") as f:
            hat_data = json.load(f)
        hat_presets = hat_data.get("presets", {})
        if "Tight Closed Hat" in hat_presets:
            hat_recipe = resolve_spec("hat", hat_presets["Tight Closed Hat"])
            _, debug_info = render_one_shot(
                "hat", hat_recipe, output_dir, "hat_tight_closed_hat",
                seed=args.seed, debug=args.debug, qc=args.qc, mode=args.mode,
                script_name="render.py preset-pack"
            )
            if args.qc and debug_info.get('qc_result', {}).get('status') == "FAIL":
                failures.append("hat: Tight Closed Hat")
    
    # Summary
    print(f"\n{'='*60}")
    print("MIX-READY PACK SUMMARY")
    print(f"{'='*60}")
    print(f"Output directory: {output_dir}")
    
    if failures:
        print(f"\nQC FAILURES ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        return 1
    else:
        print("\nAll renders PASSED QC checks!")
        return 0


def cmd_spec_recipes(args):
    """Render spec recipe presets."""
    instrument = args.instrument
    
    # Load presets
    presets_file = Path(f"presets/{instrument}_spec_presets.json")
    if not presets_file.exists():
        print(f"Error: {presets_file} not found")
        return 1
    
    with open(presets_file, "r") as f:
        data = json.load(f)
    
    presets = data.get("presets", {})
    if not presets:
        print("No presets found in file")
        return 1
    
    output_dir = args.output_dir or get_unique_output_dir(f"{instrument}_spec")
    
    print(f"Rendering {len(presets)} {instrument} spec presets to {output_dir}")
    if args.debug:
        print("Debug mode enabled")
    if args.qc:
        print("QC analysis enabled")
    
    failures = []
    
    # Helper to resolve spec params
    def resolve_spec(instrument: str, params: dict) -> dict:
        from engine.instruments.kick import resolve_kick_spec_params
        from engine.instruments.snare import resolve_snare_spec_params
        from engine.instruments.hat import resolve_hat_spec_params
        
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
    
    # Render each preset
    for preset_name, preset_params in presets.items():
        resolved = resolve_spec(instrument, preset_params)
        filename = f"{instrument}_spec_{preset_name.lower().replace(' ', '_').replace('&', 'and')}"
        
        _, debug_info = render_one_shot(
            instrument, resolved, output_dir, filename,
            seed=args.seed, debug=args.debug, qc=args.qc, mode=args.mode,
            script_name=f"render.py spec-recipes {instrument}"
        )
        
        if args.qc and debug_info.get('qc_result', {}).get('status') == "FAIL":
            failures.append(preset_name)
    
    if failures:
        print(f"\nQC FAILURES ({len(failures)}): {', '.join(failures)}")
        return 1
    
    return 0


def cmd_control_proof(args):
    """Render control proof: baseline + ADSR variants + fader variants."""
    output_dir = args.output_dir or get_unique_output_dir("control_proof")
    
    print(f"Rendering control proof to {output_dir}")
    if args.debug:
        print("Debug mode enabled")
    
    def _deep_set(d: dict, keys: list, value: float) -> dict:
        import copy
        result = copy.deepcopy(d)
        current = result
        for key in keys[:-1]:
            if key not in current:
                current[key] = {}
            elif not isinstance(current[key], dict):
                current[key] = {}
            else:
                current[key] = copy.deepcopy(current[key])
            current = current[key]
        current[keys[-1]] = value
        return result
    
    # Kick
    print("\nKICK:")
    kick_base = DEFAULT_PRESET["kick"]
    
    # Baseline
    _, _ = render_one_shot(
        "kick", kick_base, output_dir, "kick_baseline",
        seed=args.seed, debug=args.debug, qc=False, mode=args.mode,
        script_name="render.py control-proof"
    )
    
    # ADSR proof: click decay_ms = 2 vs 40
    p1 = _deep_set(kick_base, ["kick", "click", "amp", "decay_ms"], 2.0)
    _, _ = render_one_shot(
        "kick", p1, output_dir, "kick_click_decay_2ms",
        seed=args.seed, debug=args.debug, qc=False, mode=args.mode,
        script_name="render.py control-proof"
    )
    
    p2 = _deep_set(kick_base, ["kick", "click", "amp", "decay_ms"], 40.0)
    _, _ = render_one_shot(
        "kick", p2, output_dir, "kick_click_decay_40ms",
        seed=args.seed, debug=args.debug, qc=False, mode=args.mode,
        script_name="render.py control-proof"
    )
    
    # Fader proof: click gain_db = -60
    p3 = _deep_set(kick_base, ["kick", "click", "gain_db"], -60.0)
    _, _ = render_one_shot(
        "kick", p3, output_dir, "kick_click_gain_m60db",
        seed=args.seed, debug=args.debug, qc=False, mode=args.mode,
        script_name="render.py control-proof"
    )
    
    # Snare
    print("\nSNARE:")
    snare_base = DEFAULT_PRESET["snare"]
    
    # Baseline
    _, _ = render_one_shot(
        "snare", snare_base, output_dir, "snare_baseline",
        seed=args.seed, debug=args.debug, qc=False, mode=args.mode,
        script_name="render.py control-proof"
    )
    
    # ADSR proof: wires decay_ms = 60 vs 220
    p1 = _deep_set(snare_base, ["snare", "wires", "amp", "decay_ms"], 60.0)
    _, _ = render_one_shot(
        "snare", p1, output_dir, "snare_wires_decay_60ms",
        seed=args.seed, debug=args.debug, qc=False, mode=args.mode,
        script_name="render.py control-proof"
    )
    
    p2 = _deep_set(snare_base, ["snare", "wires", "amp", "decay_ms"], 220.0)
    _, _ = render_one_shot(
        "snare", p2, output_dir, "snare_wires_decay_220ms",
        seed=args.seed, debug=args.debug, qc=False, mode=args.mode,
        script_name="render.py control-proof"
    )
    
    # Fader proof: wires gain_db = -60
    p3 = _deep_set(snare_base, ["snare", "wires", "gain_db"], -60.0)
    _, _ = render_one_shot(
        "snare", p3, output_dir, "snare_wires_gain_m60db",
        seed=args.seed, debug=args.debug, qc=False, mode=args.mode,
        script_name="render.py control-proof"
    )
    
    # Hat
    print("\nHAT:")
    hat_base = DEFAULT_PRESET["hat"]
    
    # Baseline
    _, _ = render_one_shot(
        "hat", hat_base, output_dir, "hat_baseline",
        seed=args.seed, debug=args.debug, qc=False, mode=args.mode,
        script_name="render.py control-proof"
    )
    
    # ADSR proof: air decay_ms = 20 vs 80
    p1 = _deep_set(hat_base, ["hat", "air", "amp", "decay_ms"], 20.0)
    _, _ = render_one_shot(
        "hat", p1, output_dir, "hat_air_decay_20ms",
        seed=args.seed, debug=args.debug, qc=False, mode=args.mode,
        script_name="render.py control-proof"
    )
    
    p2 = _deep_set(hat_base, ["hat", "air", "amp", "decay_ms"], 80.0)
    _, _ = render_one_shot(
        "hat", p2, output_dir, "hat_air_decay_80ms",
        seed=args.seed, debug=args.debug, qc=False, mode=args.mode,
        script_name="render.py control-proof"
    )
    
    # Fader proof: air gain_db = -60
    p3 = _deep_set(hat_base, ["hat", "air", "gain_db"], -60.0)
    _, _ = render_one_shot(
        "hat", p3, output_dir, "hat_air_gain_m60db",
        seed=args.seed, debug=args.debug, qc=False, mode=args.mode,
        script_name="render.py control-proof"
    )
    
    print(f"\nDone. Output in {output_dir}/")
    return 0


def cmd_param_sweep(args):
    """Run param sweep tests to catch no-op renders."""
    output_dir = args.output_dir or get_unique_output_dir("param_sweep")
    
    print(f"Running param sweep tests to {output_dir}")
    print("Testing that parameter changes actually affect output...\n")
    
    failures = []
    
    # Test 1: Kick click gain_db = 0 vs -60 (should change output)
    print("TEST 1: Kick click gain_db = 0 vs -60")
    import copy
    kick_base = copy.deepcopy(DEFAULT_PRESET["kick"])
    
    # Properly set nested param
    p1 = copy.deepcopy(kick_base)
    if "kick" not in p1:
        p1["kick"] = {}
    if "click" not in p1["kick"]:
        p1["kick"]["click"] = {}
    p1["kick"]["click"]["gain_db"] = 0.0
    
    p2 = copy.deepcopy(kick_base)
    if "kick" not in p2:
        p2["kick"] = {}
    if "click" not in p2["kick"]:
        p2["kick"]["click"] = {}
    p2["kick"]["click"]["gain_db"] = -60.0
    
    audio1, info1 = render_one_shot(
        "kick", p1, output_dir, "kick_click_0db",
        seed=42, debug=True, qc=False, mode=args.mode,
        script_name="render.py param-sweep"
    )
    
    audio2, info2 = render_one_shot(
        "kick", p2, output_dir, "kick_click_m60db",
        seed=42, debug=True, qc=False, mode=args.mode,
        script_name="render.py param-sweep"
    )
    
    hash1 = info1["fingerprint"]["sha256"]
    hash2 = info2["fingerprint"]["sha256"]
    
    if hash1 == hash2:
        failures.append("Kick click gain_db: Hashes identical (no-op render)")
        print("  FAIL: Hashes identical!")
    else:
        print(f"  PASS: Hashes differ ({hash1[:8]} vs {hash2[:8]})")
        
        # Check early transient peak (should drop with -60dB)
        peak1 = float(torch.max(torch.abs(audio1[:2400])))  # First 50ms
        peak2 = float(torch.max(torch.abs(audio2[:2400])))
        if peak2 >= peak1 * 0.9:
            failures.append("Kick click gain_db: Early peak did not drop enough")
            print(f"  WARN: Early peak did not drop enough ({peak1:.4f} -> {peak2:.4f})")
        else:
            print(f"  PASS: Early peak dropped ({peak1:.4f} -> {peak2:.4f})")
    
    # Test 2: Snare wires gain_db = 0 vs -60 (should change output)
    print("\nTEST 2: Snare wires gain_db = 0 vs -60")
    import copy
    snare_base = copy.deepcopy(DEFAULT_PRESET["snare"])
    
    p1 = copy.deepcopy(snare_base)
    if "snare" not in p1:
        p1["snare"] = {}
    if "wires" not in p1["snare"]:
        p1["snare"]["wires"] = {}
    p1["snare"]["wires"]["gain_db"] = 0.0
    
    p2 = copy.deepcopy(snare_base)
    if "snare" not in p2:
        p2["snare"] = {}
    if "wires" not in p2["snare"]:
        p2["snare"]["wires"] = {}
    p2["snare"]["wires"]["gain_db"] = -60.0
    
    audio1, info1 = render_one_shot(
        "snare", p1, output_dir, "snare_wires_0db",
        seed=42, debug=True, qc=False, mode=args.mode,
        script_name="render.py param-sweep"
    )
    
    audio2, info2 = render_one_shot(
        "snare", p2, output_dir, "snare_wires_m60db",
        seed=42, debug=True, qc=False, mode=args.mode,
        script_name="render.py param-sweep"
    )
    
    hash1 = info1["fingerprint"]["sha256"]
    hash2 = info2["fingerprint"]["sha256"]
    
    if hash1 == hash2:
        failures.append("Snare wires gain_db: Hashes identical (no-op render)")
        print("  FAIL: Hashes identical!")
    else:
        print(f"  PASS: Hashes differ ({hash1[:8]} vs {hash2[:8]})")
    
    # Test 3: Hat air gain_db = 0 vs -60 (should change output)
    print("\nTEST 3: Hat air gain_db = 0 vs -60")
    import copy
    hat_base = copy.deepcopy(DEFAULT_PRESET["hat"])
    
    p1 = copy.deepcopy(hat_base)
    if "hat" not in p1:
        p1["hat"] = {}
    if "air" not in p1["hat"]:
        p1["hat"]["air"] = {}
    p1["hat"]["air"]["gain_db"] = 0.0
    
    p2 = copy.deepcopy(hat_base)
    if "hat" not in p2:
        p2["hat"] = {}
    if "air" not in p2["hat"]:
        p2["hat"]["air"] = {}
    p2["hat"]["air"]["gain_db"] = -60.0
    
    audio1, info1 = render_one_shot(
        "hat", p1, output_dir, "hat_air_0db",
        seed=42, debug=True, qc=False, mode=args.mode,
        script_name="render.py param-sweep"
    )
    
    audio2, info2 = render_one_shot(
        "hat", p2, output_dir, "hat_air_m60db",
        seed=42, debug=True, qc=False, mode=args.mode,
        script_name="render.py param-sweep"
    )
    
    hash1 = info1["fingerprint"]["sha256"]
    hash2 = info2["fingerprint"]["sha256"]
    
    if hash1 == hash2:
        failures.append("Hat air gain_db: Hashes identical (no-op render)")
        print("  FAIL: Hashes identical!")
    else:
        print(f"  PASS: Hashes differ ({hash1[:8]} vs {hash2[:8]})")
    
    # Summary
    print(f"\n{'='*60}")
    print("PARAM SWEEP SUMMARY")
    print(f"{'='*60}")
    
    if failures:
        print(f"\nFAILURES ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        print("\n⚠️  RENDERS ARE NOT CHANGING - CHECK PARAM RESOLUTION!")
        return 1
    else:
        print("\n✅ All param changes produce different outputs!")
        return 0


def main():
    parser = argparse.ArgumentParser(
        description="Canonical renderer tool with debug outputs and fingerprinting"
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Subcommand")
    
    # Common arguments
    def add_common_args(p):
        p.add_argument("--seed", type=int, default=None, help="Fixed seed (default: random)")
        p.add_argument("--debug", action="store_true", help="Save resolved.json with param trace")
        p.add_argument("--qc", action="store_true", help="Run QC analysis")
        p.add_argument("--mode", choices=["default", "realistic"], default="default",
                      help="Generation mode: default or realistic (applies clamps)")
        p.add_argument("--output-dir", type=str, help="Output directory (default: unique timestamped)")
    
    # one-shot subcommand
    p_one = subparsers.add_parser("one-shot", help="Render a single one-shot")
    p_one.add_argument("instrument", choices=["kick", "snare", "hat"])
    p_one.add_argument("params_json", nargs="?", help="JSON file with params (optional)")
    p_one.add_argument("--filename", type=str, help="Output filename (without extension)")
    add_common_args(p_one)
    
    # preset-pack subcommand
    p_pack = subparsers.add_parser("preset-pack", help="Render mix-ready pack")
    add_common_args(p_pack)
    
    # spec-recipes subcommand
    p_spec = subparsers.add_parser("spec-recipes", help="Render spec recipe presets")
    p_spec.add_argument("instrument", choices=["kick", "snare", "hat"])
    add_common_args(p_spec)
    
    # control-proof subcommand
    p_ctrl = subparsers.add_parser("control-proof", help="Render control proof")
    add_common_args(p_ctrl)
    
    # param-sweep subcommand
    p_sweep = subparsers.add_parser("param-sweep", help="Run param sweep tests")
    add_common_args(p_sweep)
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 1
    
    if args.command == "one-shot":
        return cmd_one_shot(args)
    elif args.command == "preset-pack":
        return cmd_preset_pack(args)
    elif args.command == "spec-recipes":
        return cmd_spec_recipes(args)
    elif args.command == "control-proof":
        return cmd_control_proof(args)
    elif args.command == "param-sweep":
        return cmd_param_sweep(args)
    else:
        parser.print_help()
        return 1


if __name__ == "__main__":
    sys.exit(main())
