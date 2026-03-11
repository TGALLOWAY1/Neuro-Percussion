#!/usr/bin/env python3
"""
Canonical renderer tool with debug outputs, fingerprinting, and param tracing.

Usage:
    python -m tools.render <subcommand> [options]

Subcommands:
    one-shot <instrument> [params.json]     Render a single one-shot
    preset-pack                              Render mix-ready pack
    spec-recipes <instrument>                Render spec recipe presets
    macro-presets                            Render macro-only presets
    listen-pack                              Render listening pack
    control-proof                            Render control proof
    param-sweep                              Run param sweep tests
"""
import sys
import os
import argparse

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from tools.render.one_shot import cmd_one_shot
from tools.render.preset_pack import cmd_preset_pack
from tools.render.spec_recipes import cmd_spec_recipes
from tools.render.macro_presets import cmd_macro_presets
from tools.render.listen_pack import cmd_listen_pack
from tools.render.control_proof import cmd_control_proof
from tools.render.param_sweep import cmd_param_sweep

COMMANDS = {
    "one-shot": cmd_one_shot,
    "preset-pack": cmd_preset_pack,
    "spec-recipes": cmd_spec_recipes,
    "macro-presets": cmd_macro_presets,
    "listen-pack": cmd_listen_pack,
    "control-proof": cmd_control_proof,
    "param-sweep": cmd_param_sweep,
}


def add_common_args(p):
    p.add_argument("--seed", type=int, default=None, help="Fixed seed (default: random)")
    p.add_argument("--debug", action="store_true", help="Save resolved.json with param trace")
    p.add_argument("--qc", action="store_true", help="Run QC analysis")
    p.add_argument("--mode", choices=["default", "realistic"], default="default",
                   help="Generation mode: default or realistic")
    p.add_argument("--output-dir", type=str, help="Output directory")


def main():
    parser = argparse.ArgumentParser(
        description="Canonical renderer tool with debug outputs and fingerprinting"
    )
    subparsers = parser.add_subparsers(dest="command", help="Subcommand")

    # one-shot
    p_one = subparsers.add_parser("one-shot", help="Render a single one-shot")
    p_one.add_argument("instrument", choices=["kick", "snare", "hat"])
    p_one.add_argument("params_json", nargs="?", help="JSON file with params")
    p_one.add_argument("--filename", type=str, help="Output filename (without extension)")
    add_common_args(p_one)

    # preset-pack
    add_common_args(subparsers.add_parser("preset-pack", help="Render mix-ready pack"))

    # spec-recipes
    p_spec = subparsers.add_parser("spec-recipes", help="Render spec recipe presets")
    p_spec.add_argument("instrument", choices=["kick", "snare", "hat"])
    add_common_args(p_spec)

    # macro-presets
    add_common_args(subparsers.add_parser("macro-presets", help="Render macro-only presets"))

    # listen-pack
    add_common_args(subparsers.add_parser("listen-pack", help="Render listening pack"))

    # control-proof
    add_common_args(subparsers.add_parser("control-proof", help="Render control proof"))

    # param-sweep
    add_common_args(subparsers.add_parser("param-sweep", help="Run param sweep tests"))

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return 1

    return COMMANDS[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
