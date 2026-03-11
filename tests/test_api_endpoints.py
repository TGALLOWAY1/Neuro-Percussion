"""
Tests for FastAPI endpoints — input validation, error handling, and response formats.
Uses FastAPI's TestClient for synchronous request testing.

Requires torch (PyTorch) for instrument rendering. Skip with:
    pytest tests/test_api_endpoints.py -m "not requires_torch"
"""

import pytest

torch = pytest.importorskip("torch", reason="torch required for API endpoint tests")
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    import sys
    import os
    # main.py lives inside engine/ and uses `from engine.xxx` imports,
    # so we need the repo root on sys.path and import via engine dir
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    engine_dir = os.path.join(repo_root, "engine")
    if engine_dir not in sys.path:
        sys.path.insert(0, engine_dir)
    if repo_root not in sys.path:
        sys.path.insert(0, repo_root)

    # Import main from the engine directory
    from importlib import import_module
    main_module = import_module("main")
    return TestClient(main_module.app)


class TestHealthEndpoint:
    def test_health_returns_ok(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "neuro-percussion-engine"


class TestFeedbackEndpoint:
    def test_valid_feedback(self, client):
        response = client.post("/feedback", json={
            "instrument": "kick",
            "params": {"punch_decay": 0.5},
            "seed": 42,
            "label": 1,
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"

    def test_invalid_instrument_returns_422(self, client):
        response = client.post("/feedback", json={
            "instrument": "trumpet",
            "params": {},
            "seed": 1,
            "label": 1,
        })
        assert response.status_code == 422  # Pydantic validation error

    def test_invalid_label_returns_422(self, client):
        response = client.post("/feedback", json={
            "instrument": "kick",
            "params": {},
            "seed": 1,
            "label": 5,  # Must be 0 or 1
        })
        assert response.status_code == 422

    def test_missing_fields_returns_422(self, client):
        response = client.post("/feedback", json={
            "instrument": "kick",
        })
        assert response.status_code == 422


class TestProposeEndpoint:
    def test_valid_instrument(self, client):
        response = client.get("/propose/kick")
        assert response.status_code == 200
        data = response.json()
        # Should contain param keys from PARAM_SPACES
        assert isinstance(data, dict)

    def test_invalid_instrument_returns_404(self, client):
        response = client.get("/propose/trumpet")
        assert response.status_code == 404


class TestSchemaEndpoint:
    def test_valid_instrument(self, client):
        response = client.get("/schema/kick")
        assert response.status_code == 200
        data = response.json()
        assert data["instrument"] == "kick"
        assert "schema" in data

    def test_invalid_instrument_returns_404(self, client):
        response = client.get("/schema/trumpet")
        assert response.status_code == 404


class TestDefaultsEndpoint:
    def test_valid_instrument(self, client):
        response = client.get("/defaults/kick")
        assert response.status_code == 200
        data = response.json()
        assert data["instrument"] == "kick"
        assert "defaults" in data
        assert isinstance(data["defaults"], dict)

    def test_all_instruments_have_defaults(self, client):
        for inst in ["kick", "snare", "hat"]:
            response = client.get(f"/defaults/{inst}")
            assert response.status_code == 200

    def test_invalid_instrument_returns_404(self, client):
        response = client.get("/defaults/trumpet")
        assert response.status_code == 404


class TestGenerateEndpoints:
    def test_kick_returns_wav(self, client):
        response = client.post("/generate/kick", json={"seed": 42})
        assert response.status_code == 200
        assert response.headers["content-type"] == "audio/wav"
        # WAV files start with "RIFF"
        assert response.content[:4] == b"RIFF"

    def test_snare_returns_wav(self, client):
        response = client.post("/generate/snare", json={"seed": 42})
        assert response.status_code == 200
        assert response.content[:4] == b"RIFF"

    def test_hat_returns_wav(self, client):
        response = client.post("/generate/hat", json={"seed": 42})
        assert response.status_code == 200
        assert response.content[:4] == b"RIFF"

    def test_empty_params_uses_defaults(self, client):
        response = client.post("/generate/kick", json={})
        assert response.status_code == 200
        assert response.content[:4] == b"RIFF"

    def test_realistic_mode(self, client):
        response = client.post("/generate/kick?mode=realistic", json={"seed": 42})
        assert response.status_code == 200
        assert response.content[:4] == b"RIFF"

    def test_deterministic_with_same_seed(self, client):
        r1 = client.post("/generate/kick", json={"seed": 999})
        r2 = client.post("/generate/kick", json={"seed": 999})
        assert r1.content == r2.content
