#!/usr/bin/env python3
"""
Generate param_schema.json from Python PARAM_SCHEMA.

This is the single source of truth for parameter definitions.
Frontend can import the generated JSON to validate its contract.

Usage: python scripts/generate_param_schema.py
"""
import json
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine.params.schema import PARAM_SCHEMA

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "param_schema.json")


def main():
    # Convert PARAM_SCHEMA to JSON-serializable format
    schema = {}
    for instrument, params in PARAM_SCHEMA.items():
        schema[instrument] = {}
        for param_name, entry in params.items():
            schema[instrument][param_name] = {
                "type": entry["type"],
                "default": entry["default"],
                "min": entry["min"],
                "max": entry["max"],
                "group": entry["group"],
            }

    with open(OUTPUT_PATH, "w") as f:
        json.dump(schema, f, indent=2, sort_keys=True)
        f.write("\n")

    param_count = sum(len(params) for params in schema.values())
    print(f"Generated {OUTPUT_PATH} ({param_count} params across {len(schema)} instruments)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
