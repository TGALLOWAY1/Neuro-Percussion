"""
Contract sync check: verifies param_schema.json matches Python PARAM_SCHEMA.

Run `python scripts/generate_param_schema.py` to regenerate after schema changes.
If this test fails, the generated JSON is out of date.
"""
import json
import os
import pytest

# Load Python schema
from engine.params.schema import PARAM_SCHEMA

SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "..", "param_schema.json")


@pytest.fixture
def json_schema():
    if not os.path.exists(SCHEMA_PATH):
        pytest.skip("param_schema.json not found — run scripts/generate_param_schema.py")
    with open(SCHEMA_PATH) as f:
        return json.load(f)


def test_json_schema_exists():
    """param_schema.json must exist in the repo root."""
    assert os.path.exists(SCHEMA_PATH), (
        "param_schema.json not found. Run: python scripts/generate_param_schema.py"
    )


def test_instruments_match(json_schema):
    """JSON schema must have the same instruments as Python PARAM_SCHEMA."""
    assert set(json_schema.keys()) == set(PARAM_SCHEMA.keys()), (
        f"Instrument mismatch: JSON={set(json_schema.keys())}, "
        f"Python={set(PARAM_SCHEMA.keys())}"
    )


def test_param_keys_match(json_schema):
    """Every instrument must have the same parameter keys in JSON and Python."""
    for instrument in PARAM_SCHEMA:
        python_keys = set(PARAM_SCHEMA[instrument].keys())
        json_keys = set(json_schema[instrument].keys())
        assert python_keys == json_keys, (
            f"{instrument}: key mismatch.\n"
            f"  Only in Python: {python_keys - json_keys}\n"
            f"  Only in JSON:   {json_keys - python_keys}"
        )


def test_param_types_match(json_schema):
    """Parameter types must match between JSON and Python."""
    mismatches = []
    for instrument in PARAM_SCHEMA:
        for param_name, entry in PARAM_SCHEMA[instrument].items():
            json_entry = json_schema[instrument].get(param_name)
            if json_entry is None:
                continue  # Caught by test_param_keys_match
            if entry["type"] != json_entry["type"]:
                mismatches.append(
                    f"{instrument}.{param_name}: type {entry['type']} != {json_entry['type']}"
                )
    assert not mismatches, "Type mismatches:\n" + "\n".join(mismatches)


def test_param_defaults_match(json_schema):
    """Parameter defaults must match between JSON and Python."""
    mismatches = []
    for instrument in PARAM_SCHEMA:
        for param_name, entry in PARAM_SCHEMA[instrument].items():
            json_entry = json_schema[instrument].get(param_name)
            if json_entry is None:
                continue
            if entry["default"] != json_entry["default"]:
                mismatches.append(
                    f"{instrument}.{param_name}: default {entry['default']} != {json_entry['default']}"
                )
    assert not mismatches, "Default mismatches:\n" + "\n".join(mismatches)


def test_param_ranges_match(json_schema):
    """Parameter min/max ranges must match between JSON and Python."""
    mismatches = []
    for instrument in PARAM_SCHEMA:
        for param_name, entry in PARAM_SCHEMA[instrument].items():
            json_entry = json_schema[instrument].get(param_name)
            if json_entry is None:
                continue
            if entry["min"] != json_entry["min"]:
                mismatches.append(
                    f"{instrument}.{param_name}: min {entry['min']} != {json_entry['min']}"
                )
            if entry["max"] != json_entry["max"]:
                mismatches.append(
                    f"{instrument}.{param_name}: max {entry['max']} != {json_entry['max']}"
                )
    assert not mismatches, "Range mismatches:\n" + "\n".join(mismatches)


def test_param_count():
    """Sanity check: each instrument should have a reasonable number of params."""
    for instrument, params in PARAM_SCHEMA.items():
        assert len(params) >= 4, f"{instrument} has too few params: {len(params)}"
        assert len(params) <= 100, f"{instrument} has too many params: {len(params)}"
