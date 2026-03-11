"""
Tests for ML pipeline — PreferenceModel, DatasetStore, Sampler.
Covers training, prediction, dataset I/O, and proposal generation.
"""

import json
import os
import tempfile
import pytest
from engine.ml.model import PreferenceModel
from engine.ml.dataset import DatasetStore
from engine.ml.sampler import Sampler


# ── PreferenceModel ───────────────────────────────────────


class TestPreferenceModel:
    def test_unfitted_model_returns_0_5(self):
        model = PreferenceModel()
        assert model.predict_proba({"a": 0.5, "b": 0.3}) == 0.5

    def test_train_requires_minimum_samples(self):
        model = PreferenceModel()
        data = [
            {"params": {"a": 0.1}, "label": 1},
            {"params": {"a": 0.2}, "label": 0},
        ]
        model.train(data)
        assert model.fitted is False  # Only 2 samples, needs >= 5

    def test_train_with_sufficient_data(self):
        model = PreferenceModel()
        data = [
            {"params": {"x": float(i) / 10, "y": float(i) / 5}, "label": 1 if i > 5 else 0}
            for i in range(10)
        ]
        model.train(data)
        assert model.fitted is True

    def test_predict_returns_probability(self):
        model = PreferenceModel()
        data = [
            {"params": {"x": float(i) / 10, "y": float(i) / 5}, "label": 1 if i > 5 else 0}
            for i in range(10)
        ]
        model.train(data)
        prob = model.predict_proba({"x": 0.8, "y": 1.6})
        assert 0.0 <= prob <= 1.0

    def test_train_ignores_nested_dicts(self):
        model = PreferenceModel()
        data = [
            {
                "params": {"macro_a": float(i) / 10, "kick": {"sub_param": 0.5}},
                "label": 1 if i > 5 else 0,
            }
            for i in range(10)
        ]
        model.train(data)
        assert model.fitted is True
        assert model._feature_keys == ["macro_a"]

    def test_predict_with_missing_keys_uses_zero(self):
        model = PreferenceModel()
        data = [
            {"params": {"a": float(i) / 10, "b": float(i) / 5}, "label": 1 if i > 5 else 0}
            for i in range(10)
        ]
        model.train(data)
        # Predict with only one key — should use 0.0 for "b"
        prob = model.predict_proba({"a": 0.8})
        assert 0.0 <= prob <= 1.0

    def test_train_empty_data(self):
        model = PreferenceModel()
        model.train([])
        assert model.fitted is False


# ── DatasetStore ──────────────────────────────────────────


class TestDatasetStore:
    def test_add_and_load(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test_data.jsonl")
            store = DatasetStore(filepath)

            store.add("kick", {"a": 0.5}, {}, 1, 42)
            store.add("kick", {"a": 0.3}, {}, 0, 43)
            store.add("snare", {"b": 0.7}, {}, 1, 44)

            # Load all for kick
            kick_data = store.load("kick")
            assert len(kick_data) == 2
            assert kick_data[0]["seed"] == 42
            assert kick_data[1]["label"] == 0

            # Load for snare
            snare_data = store.load("snare")
            assert len(snare_data) == 1

    def test_load_empty_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "empty.jsonl")
            store = DatasetStore(filepath)
            data = store.load("kick")
            assert data == []

    def test_load_skips_malformed_json(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "bad.jsonl")
            with open(filepath, "w") as f:
                f.write('{"instrument": "kick", "params": {}, "label": 1, "seed": 1}\n')
                f.write("NOT VALID JSON\n")
                f.write('{"instrument": "kick", "params": {}, "label": 0, "seed": 2}\n')

            store = DatasetStore(filepath)
            data = store.load("kick")
            assert len(data) == 2

    def test_add_creates_directory(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "nested", "dir", "data.jsonl")
            store = DatasetStore(filepath)
            store.add("kick", {"a": 1}, {}, 1, 1)

            assert os.path.exists(filepath)

    def test_entry_has_schema_version(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "versioned.jsonl")
            store = DatasetStore(filepath)
            store.add("kick", {"a": 0.5}, {}, 1, 42)

            with open(filepath) as f:
                entry = json.loads(f.readline())
            assert entry["schema_version"] == 1
            assert "timestamp" in entry


# ── Sampler ───────────────────────────────────────────────


class TestSampler:
    def _make_trained_model(self):
        model = PreferenceModel()
        data = [
            {"params": {"x": float(i) / 10, "y": float(i) / 5}, "label": 1 if i > 5 else 0}
            for i in range(10)
        ]
        model.train(data)
        return model

    def test_propose_returns_valid_params(self):
        model = self._make_trained_model()
        sampler = Sampler(model)
        space = {"x": (0.0, 1.0), "y": (0.0, 2.0)}

        result = sampler.propose(space)
        assert set(result.keys()) == {"x", "y"}
        assert 0.0 <= result["x"] <= 1.0
        assert 0.0 <= result["y"] <= 2.0

    def test_propose_unfitted_returns_random(self):
        model = PreferenceModel()
        sampler = Sampler(model)
        space = {"a": (0.0, 1.0)}

        result = sampler.propose(space)
        assert "a" in result
        assert 0.0 <= result["a"] <= 1.0

    def test_mutate_stays_within_bounds(self):
        model = self._make_trained_model()
        sampler = Sampler(model)
        space = {"x": (0.0, 1.0), "y": (0.0, 2.0)}

        params = {"x": 0.5, "y": 1.0}
        for _ in range(50):
            result = sampler.mutate(params, space, sigma=0.5)
            assert 0.0 <= result["x"] <= 1.0
            assert 0.0 <= result["y"] <= 2.0

    def test_mutate_produces_different_values(self):
        model = self._make_trained_model()
        sampler = Sampler(model)
        space = {"x": (0.0, 1.0), "y": (0.0, 2.0)}

        params = {"x": 0.5, "y": 1.0}
        results = [sampler.mutate(params, space, sigma=0.3) for _ in range(10)]

        # At least some mutations should differ
        x_values = [r["x"] for r in results]
        assert len(set(round(v, 6) for v in x_values)) > 1
