"""preset-pack subcommand: render mix-ready pack."""
import json
from pathlib import Path
from tools.render_core import render_one_shot, get_unique_output_dir
from tools.render.common import resolve_spec


def cmd_preset_pack(args):
    output_dir = args.output_dir or get_unique_output_dir("mixready_pack")

    print(f"Rendering mix-ready pack to {output_dir}")
    if args.debug:
        print("Debug mode enabled (saving resolved.json)")
    if args.qc:
        print("QC analysis enabled")

    failures = []
    script = "render preset-pack"

    # Kick: default spec
    kick_default = {
        "kick": {"spec": {
            "pitch_hz": 55.0, "pitch_env_semitones": 24.0, "pitch_decay_ms": 50.0,
            "amp_decay_ms": 350.0, "click_level": 0.5, "click_attack_ms": 0.5,
            "click_filter_hz": 7000.0, "hardness": 0.6, "drive_fold": 0.0,
            "eq_scoop_hz": 300.0, "eq_scoop_db": -6.0, "global_attack_ms": 0.0,
            "comp_ratio": 3.0, "comp_attack_ms": 5.0, "comp_release_ms": 200.0,
        }}
    }
    _, debug_info = render_one_shot(
        "kick", resolve_spec("kick", kick_default), output_dir, "kick_default_spec",
        seed=args.seed, debug=args.debug, qc=args.qc, mode=args.mode, script_name=script,
    )
    if args.qc and debug_info.get('qc_result', {}).get('status') == "FAIL":
        failures.append("kick: Default Spec")

    # Kick: 1 recipe (Punchy House)
    _render_preset_if_exists(
        "kick", "presets/kick_spec_presets.json", "Punchy House", "kick_punchy_house",
        output_dir, args, failures, script,
    )

    # Snare: default spec
    snare_default = {
        "snare": {"spec": {
            "tune_hz": 200.0, "tone_decay_ms": 150.0, "pitch_env_st": 12.0,
            "snare_level": 0.6, "noise_decay_ms": 250.0, "wire_filter_hz": 5000.0,
            "snap_attack_ms": 1.0, "hardness": 0.5, "box_cut_db": -6.0, "box_cut_hz": 500.0,
        }}
    }
    _, debug_info = render_one_shot(
        "snare", resolve_spec("snare", snare_default), output_dir, "snare_default_spec",
        seed=args.seed, debug=args.debug, qc=args.qc, mode=args.mode, script_name=script,
    )
    if args.qc and debug_info.get('qc_result', {}).get('status') == "FAIL":
        failures.append("snare: Default Spec")

    # Snare: 1 recipe
    _render_preset_if_exists(
        "snare", "presets/snare_spec_presets.json", "Tight Pop Snare", "snare_tight_pop_snare",
        output_dir, args, failures, script,
    )

    # Hat: default spec
    hat_default = {
        "hat": {"spec": {
            "metal_pitch_hz": 800.0, "dissonance": 0.7, "fm_amount": 0.5,
            "hpf_hz": 3000.0, "color_hz": 8000.0, "decay_ms": 80.0,
            "choke_group": True, "is_open": False, "attack_ms": 0.0,
        }}
    }
    _, debug_info = render_one_shot(
        "hat", resolve_spec("hat", hat_default), output_dir, "hat_default_spec",
        seed=args.seed, debug=args.debug, qc=args.qc, mode=args.mode, script_name=script,
    )
    if args.qc and debug_info.get('qc_result', {}).get('status') == "FAIL":
        failures.append("hat: Default Spec")

    # Hat: 1 recipe
    _render_preset_if_exists(
        "hat", "presets/hat_spec_presets.json", "Tight Closed Hat", "hat_tight_closed_hat",
        output_dir, args, failures, script,
    )

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


def _render_preset_if_exists(instrument, presets_path, preset_name, filename,
                              output_dir, args, failures, script):
    presets_file = Path(presets_path)
    if not presets_file.exists():
        return
    with open(presets_file, "r") as f:
        data = json.load(f)
    presets = data.get("presets", {})
    if preset_name not in presets:
        return
    resolved = resolve_spec(instrument, presets[preset_name])
    _, debug_info = render_one_shot(
        instrument, resolved, output_dir, filename,
        seed=args.seed, debug=args.debug, qc=args.qc, mode=args.mode, script_name=script,
    )
    if args.qc and debug_info.get('qc_result', {}).get('status') == "FAIL":
        failures.append(f"{instrument}: {preset_name}")
