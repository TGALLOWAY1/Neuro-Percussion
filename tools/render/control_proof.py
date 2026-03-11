"""control-proof subcommand: render ADSR and fader variants."""
from tools.render_core import render_one_shot, get_unique_output_dir
from tools.render.common import deep_set
from engine.params.schema import DEFAULT_PRESET


def cmd_control_proof(args):
    output_dir = args.output_dir or get_unique_output_dir("control_proof")
    print(f"Rendering control proof to {output_dir}")
    if args.debug:
        print("Debug mode enabled")

    script = "render control-proof"

    # Kick
    print("\nKICK:")
    kick_base = DEFAULT_PRESET["kick"]
    render_one_shot("kick", kick_base, output_dir, "kick_baseline",
                    seed=args.seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)
    render_one_shot("kick", deep_set(kick_base, ["kick", "click", "amp", "decay_ms"], 2.0),
                    output_dir, "kick_click_decay_2ms",
                    seed=args.seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)
    render_one_shot("kick", deep_set(kick_base, ["kick", "click", "amp", "decay_ms"], 40.0),
                    output_dir, "kick_click_decay_40ms",
                    seed=args.seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)
    render_one_shot("kick", deep_set(kick_base, ["kick", "click", "gain_db"], -60.0),
                    output_dir, "kick_click_gain_m60db",
                    seed=args.seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)

    # Snare
    print("\nSNARE:")
    snare_base = DEFAULT_PRESET["snare"]
    render_one_shot("snare", snare_base, output_dir, "snare_baseline",
                    seed=args.seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)
    render_one_shot("snare", deep_set(snare_base, ["snare", "wires", "amp", "decay_ms"], 60.0),
                    output_dir, "snare_wires_decay_60ms",
                    seed=args.seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)
    render_one_shot("snare", deep_set(snare_base, ["snare", "wires", "amp", "decay_ms"], 220.0),
                    output_dir, "snare_wires_decay_220ms",
                    seed=args.seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)
    render_one_shot("snare", deep_set(snare_base, ["snare", "wires", "gain_db"], -60.0),
                    output_dir, "snare_wires_gain_m60db",
                    seed=args.seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)

    # Hat
    print("\nHAT:")
    hat_base = DEFAULT_PRESET["hat"]
    render_one_shot("hat", hat_base, output_dir, "hat_baseline",
                    seed=args.seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)
    render_one_shot("hat", deep_set(hat_base, ["hat", "air", "amp", "decay_ms"], 20.0),
                    output_dir, "hat_air_decay_20ms",
                    seed=args.seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)
    render_one_shot("hat", deep_set(hat_base, ["hat", "air", "amp", "decay_ms"], 80.0),
                    output_dir, "hat_air_decay_80ms",
                    seed=args.seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)
    render_one_shot("hat", deep_set(hat_base, ["hat", "air", "gain_db"], -60.0),
                    output_dir, "hat_air_gain_m60db",
                    seed=args.seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)

    print(f"\nDone. Output in {output_dir}/")
    return 0
