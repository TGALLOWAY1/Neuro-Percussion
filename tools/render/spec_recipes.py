"""spec-recipes subcommand: render spec recipe presets."""
import json
from pathlib import Path
from tools.render_core import render_one_shot, get_unique_output_dir
from tools.render.common import resolve_spec


def cmd_spec_recipes(args):
    instrument = args.instrument
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
    for preset_name, preset_params in presets.items():
        resolved = resolve_spec(instrument, preset_params)
        filename = f"{instrument}_spec_{preset_name.lower().replace(' ', '_').replace('&', 'and')}"
        _, debug_info = render_one_shot(
            instrument, resolved, output_dir, filename,
            seed=args.seed, debug=args.debug, qc=args.qc, mode=args.mode,
            script_name=f"render spec-recipes {instrument}",
        )
        if args.qc and debug_info.get('qc_result', {}).get('status') == "FAIL":
            failures.append(preset_name)

    if failures:
        print(f"\nQC FAILURES ({len(failures)}): {', '.join(failures)}")
        return 1
    return 0
