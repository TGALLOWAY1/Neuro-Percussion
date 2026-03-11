#!/usr/bin/env python3
"""
Backward-compatible entry point.
Usage: python tools/render.py <subcommand> [options]

The implementation has moved to tools/render/ package.
You can also use: python -m tools.render <subcommand> [options]
"""
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from tools.render.__main__ import main

if __name__ == "__main__":
    sys.exit(main())
