"""param-sweep subcommand: verify param changes produce different outputs."""
import copy
import torch
from tools.render_core import render_one_shot, get_unique_output_dir
from engine.params.schema import DEFAULT_PRESET


def cmd_param_sweep(args):
    output_dir = args.output_dir or get_unique_output_dir("param_sweep")
    print(f"Running param sweep tests to {output_dir}")
    print("Testing that parameter changes actually affect output...\n")

    failures = []
    script = "render param-sweep"

    # Test 1: Kick click gain_db = 0 vs -60
    print("TEST 1: Kick click gain_db = 0 vs -60")
    _run_gain_test("kick", "click", DEFAULT_PRESET["kick"], output_dir, args, failures, script)

    # Test 2: Snare wires gain_db = 0 vs -60
    print("\nTEST 2: Snare wires gain_db = 0 vs -60")
    _run_gain_test("snare", "wires", DEFAULT_PRESET["snare"], output_dir, args, failures, script)

    # Test 3: Hat air gain_db = 0 vs -60
    print("\nTEST 3: Hat air gain_db = 0 vs -60")
    _run_gain_test("hat", "air", DEFAULT_PRESET["hat"], output_dir, args, failures, script)

    # Summary
    print(f"\n{'='*60}")
    print("PARAM SWEEP SUMMARY")
    print(f"{'='*60}")

    if failures:
        print(f"\nFAILURES ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        print("\nRENDERS ARE NOT CHANGING - CHECK PARAM RESOLUTION!")
        return 1
    else:
        print("\nAll param changes produce different outputs!")
        return 0


def _run_gain_test(instrument, layer, base_params, output_dir, args, failures, script):
    p1 = copy.deepcopy(base_params)
    p1.setdefault(instrument, {}).setdefault(layer, {})["gain_db"] = 0.0

    p2 = copy.deepcopy(base_params)
    p2.setdefault(instrument, {}).setdefault(layer, {})["gain_db"] = -60.0

    audio1, info1 = render_one_shot(
        instrument, p1, output_dir, f"{instrument}_{layer}_0db",
        seed=42, debug=True, qc=False, mode=args.mode, script_name=script,
    )
    audio2, info2 = render_one_shot(
        instrument, p2, output_dir, f"{instrument}_{layer}_m60db",
        seed=42, debug=True, qc=False, mode=args.mode, script_name=script,
    )

    hash1 = info1["fingerprint"]["sha256"]
    hash2 = info2["fingerprint"]["sha256"]

    if hash1 == hash2:
        failures.append(f"{instrument.title()} {layer} gain_db: Hashes identical (no-op render)")
        print("  FAIL: Hashes identical!")
    else:
        print(f"  PASS: Hashes differ ({hash1[:8]} vs {hash2[:8]})")
        if instrument == "kick":
            peak1 = float(torch.max(torch.abs(audio1[:2400])))
            peak2 = float(torch.max(torch.abs(audio2[:2400])))
            if peak2 >= peak1 * 0.9:
                failures.append(f"{instrument.title()} {layer} gain_db: Early peak did not drop enough")
                print(f"  WARN: Early peak did not drop enough ({peak1:.4f} -> {peak2:.4f})")
            else:
                print(f"  PASS: Early peak dropped ({peak1:.4f} -> {peak2:.4f})")
