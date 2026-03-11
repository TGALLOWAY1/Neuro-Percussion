"""macro-presets subcommand: render macro-only presets."""
import json
from pathlib import Path
from tools.render_core import render_one_shot, get_unique_output_dir
from engine.params.resolve import resolve_params


def cmd_macro_presets(args):
    output_dir = args.output_dir or get_unique_output_dir("macro_presets")
    presets_file = Path("presets/macro_presets.json")
    if not presets_file.exists():
        print(f"Error: {presets_file} not found")
        return 1

    with open(presets_file, "r") as f:
        presets_data = json.load(f)

    print(f"Rendering macro presets to {output_dir}")
    if args.debug:
        print("Debug mode enabled")

    seed = args.seed if args.seed is not None else 42

    for instrument in ("kick", "snare", "hat"):
        inst_presets = presets_data.get(instrument, {})
        if not inst_presets:
            continue
        print(f"\n{instrument.upper()}:")
        for preset_name, preset_params in inst_presets.items():
            resolved = resolve_params(instrument, preset_params)
            filename = f"{instrument}_{preset_name}"
            _, _ = render_one_shot(
                instrument, resolved, output_dir, filename,
                seed=seed, debug=args.debug, qc=False, mode=args.mode,
                script_name="render macro-presets",
            )
            _print_resolved_params(resolved, instrument, preset_name)

    print(f"\nDone. Output in {output_dir}/")
    return 0


def _print_resolved_params(resolved: dict, instrument: str, preset_name: str):
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
