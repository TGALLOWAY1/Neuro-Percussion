"""listen-pack subcommand: render listening pack (baseline + variants)."""
from tools.render_core import render_one_shot, get_unique_output_dir
from tools.render.common import shallow_deep_merge


def cmd_listen_pack(args):
    output_dir = args.output_dir or get_unique_output_dir("listen_pack")
    print(f"Rendering listening pack to {output_dir}")
    if args.debug:
        print("Debug mode enabled")

    seed = args.seed if args.seed is not None else 42
    script = "render listen-pack"
    _merge = shallow_deep_merge

    # Kick
    print("\nKICK:")
    kick_base = {
        "punch_decay": 0.35, "click_amount": 0.6, "click_snap": 0.01,
        "tune": 45.0, "room_tone_freq": 150.0, "room_air": 0.3,
        "distance_ms": 10.0, "blend": 0.3,
    }
    render_one_shot("kick", kick_base, output_dir, "kick_baseline",
                    seed=seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)
    render_one_shot("kick", _merge(kick_base, {"kick": {"click": {"gain_db": -60.0}}}),
                    output_dir, "kick_click_muted",
                    seed=seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)
    render_one_shot("kick", _merge(kick_base, {"kick": {
        "sub": {"amp": {"decay_ms": 80.0}}, "click": {"amp": {"decay_ms": 15.0}}
    }}), output_dir, "kick_short_adsr",
                    seed=seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)
    render_one_shot("kick", _merge(kick_base, {"kick": {
        "sub": {"amp": {"decay_ms": 350.0}}, "click": {"amp": {"decay_ms": 80.0}}
    }}), output_dir, "kick_long_adsr",
                    seed=seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)

    # Snare
    print("\nSNARE:")
    snare_base = {"tone": 0.5, "wire": 0.5, "crack": 0.5, "body": 0.5}
    render_one_shot("snare", snare_base, output_dir, "snare_baseline",
                    seed=seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)
    render_one_shot("snare", _merge(snare_base, {"snare": {"wires": {"gain_db": -60.0}}}),
                    output_dir, "snare_wires_muted",
                    seed=seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)
    render_one_shot("snare", _merge(snare_base, {"snare": {
        "shell": {"amp": {"decay_ms": 150.0, "sustain": 0.0}},
        "wires": {"amp": {"decay_ms": 150.0, "sustain": 0.0}},
    }}), output_dir, "snare_short_adsr",
                    seed=seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)
    render_one_shot("snare", _merge(snare_base, {"snare": {
        "shell": {"amp": {"decay_ms": 450.0, "sustain": 0.2}},
        "wires": {"amp": {"decay_ms": 400.0, "sustain": 0.1}},
    }}), output_dir, "snare_long_adsr",
                    seed=seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)

    # Hat
    print("\nHAT:")
    hat_base = {"tightness": 0.5, "sheen": 0.5, "dirt": 0.3, "color": 0.5}
    render_one_shot("hat", hat_base, output_dir, "hat_baseline",
                    seed=seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)
    render_one_shot("hat", _merge(hat_base, {"hat": {"air": {"gain_db": -60.0}}}),
                    output_dir, "hat_air_muted",
                    seed=seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)
    render_one_shot("hat", _merge(hat_base, {"hat": {
        "metal": {"amp": {"decay_ms": 80.0, "sustain": 0.0}},
        "air": {"amp": {"decay_ms": 80.0, "sustain": 0.0}},
    }}), output_dir, "hat_short_adsr",
                    seed=seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)
    render_one_shot("hat", _merge(hat_base, {"hat": {
        "metal": {"amp": {"decay_ms": 500.0, "sustain": 0.2}},
        "air": {"amp": {"decay_ms": 500.0, "sustain": 0.2}},
    }}), output_dir, "hat_long_adsr",
                    seed=seed, debug=args.debug, qc=False, mode=args.mode, script_name=script)

    print(f"\nDone. Output in {output_dir}/")
    return 0
