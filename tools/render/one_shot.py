"""one-shot subcommand: render a single one-shot."""
import json
from pathlib import Path
from tools.render_core import render_one_shot, get_unique_output_dir


def cmd_one_shot(args):
    if args.params_json:
        with open(args.params_json, "r") as f:
            params = json.load(f)
    else:
        params = {}

    if args.output_dir:
        output_dir = Path(args.output_dir)
    else:
        output_dir = get_unique_output_dir("one_shot")

    filename = args.filename or f"{args.instrument}_oneshot"

    audio, debug_info = render_one_shot(
        instrument=args.instrument,
        params=params,
        output_dir=output_dir,
        filename=filename,
        seed=args.seed,
        debug=args.debug,
        qc=args.qc,
        mode=args.mode,
        script_name="render one-shot",
    )

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
