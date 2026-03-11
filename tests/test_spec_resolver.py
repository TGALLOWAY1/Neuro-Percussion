"""Tests for the shared spec resolver to ensure behavior matches the original per-instrument resolvers."""

import pytest
from engine.params.spec_resolver import (
    resolve_kick_spec_params,
    resolve_snare_spec_params,
    resolve_hat_spec_params,
    resolve_spec_params,
    _has_spec_keys,
    _has_user_param,
    _set_nested,
)


class TestInfrastructure:
    def test_has_spec_keys_flat(self):
        assert _has_spec_keys({"kick.spec.pitch_hz": 55}, "kick")

    def test_has_spec_keys_nested(self):
        assert _has_spec_keys({"kick": {"spec": {"pitch_hz": 55}}}, "kick")

    def test_has_spec_keys_none(self):
        assert not _has_spec_keys({"kick.sub.gain_db": 0}, "kick")

    def test_has_user_param_flat(self):
        assert _has_user_param({"tune": 55}, "tune")

    def test_has_user_param_nested(self):
        assert _has_user_param({"kick": {"sub": {"gain_db": 0}}}, "kick.sub.gain_db")

    def test_has_user_param_missing(self):
        assert not _has_user_param({"kick": {}}, "kick.sub.gain_db")

    def test_set_nested(self):
        d = {}
        _set_nested(d, "kick.sub.amp.decay_ms", 350.0)
        assert d == {"kick": {"sub": {"amp": {"decay_ms": 350.0}}}}


class TestKickResolver:
    def test_no_spec_returns_empty(self):
        assert resolve_kick_spec_params({"tune": 55}) == {}

    def test_basic_spec_mapping(self):
        params = {"kick.spec.pitch_hz": 60.0, "kick.spec.amp_decay_ms": 400.0}
        result = resolve_kick_spec_params(params)
        assert result["tune"] == 60.0
        assert result["kick"]["sub"]["amp"]["decay_ms"] == 400.0

    def test_click_perceptual_curve(self):
        params = {"kick.spec.click_level": 1.0}
        result = resolve_kick_spec_params(params)
        assert result["kick"]["click"]["gain_db"] == pytest.approx(0.0)

        params = {"kick.spec.click_level": 0.0}
        result = resolve_kick_spec_params(params)
        assert result["kick"]["click"]["gain_db"] == pytest.approx(-24.0)

    def test_user_precedence(self):
        params = {
            "kick.spec.pitch_hz": 60.0,
            "tune": 80.0,  # user explicitly set
        }
        result = resolve_kick_spec_params(params)
        assert "tune" not in result  # should not override user's value

    def test_kick_tune_precedence(self):
        params = {
            "kick.spec.pitch_hz": 60.0,
            "kick": {"tune": 80.0},  # user explicitly set nested
        }
        result = resolve_kick_spec_params(params)
        assert "tune" not in result  # should not override

    def test_clamping(self):
        params = {"kick.spec.pitch_hz": 999.0}  # above max 150
        result = resolve_kick_spec_params(params)
        assert result["tune"] == 150.0

    def test_nested_spec_format(self):
        params = {"kick": {"spec": {"pitch_hz": 65.0}}}
        result = resolve_kick_spec_params(params)
        assert result["tune"] == 65.0

    def test_compressor_mapping(self):
        params = {"kick.spec.comp_ratio": 2.5}
        result = resolve_kick_spec_params(params)
        assert result["kick"]["comp"]["ratio"] == 2.5


class TestSnareResolver:
    def test_no_spec_returns_empty(self):
        assert resolve_snare_spec_params({"snare.shell.pitch_hz": 200}) == {}

    def test_basic_spec_mapping(self):
        params = {"snare.spec.tune_hz": 180.0}
        result = resolve_snare_spec_params(params)
        assert result["snare"]["shell"]["pitch_hz"] == 180.0

    def test_wires_perceptual_curve(self):
        params = {"snare.spec.snare_level": 0.0}
        result = resolve_snare_spec_params(params)
        assert result["snare"]["wires"]["gain_db"] == pytest.approx(-18.0)

        params = {"snare.spec.snare_level": 1.0}
        result = resolve_snare_spec_params(params)
        assert result["snare"]["wires"]["gain_db"] == pytest.approx(3.0)

    def test_pitch_decay_capped(self):
        params = {"snare.spec.tone_decay_ms": 300.0}
        result = resolve_snare_spec_params(params)
        assert result["snare"]["shell"]["pitch_decay_ms"] == 80.0  # min(300, 80)

    def test_box_cut_mapping(self):
        params = {"snare.spec.box_cut_hz": 450.0, "snare.spec.box_cut_db": -10.0}
        result = resolve_snare_spec_params(params)
        assert result["snare"]["box_cut"]["hz"] == 450.0
        assert result["snare"]["box_cut"]["db"] == -10.0


class TestHatResolver:
    def test_no_spec_returns_empty(self):
        assert resolve_hat_spec_params({"hat.metal.gain_db": 0}) == {}

    def test_closed_hat_defaults(self):
        params = {"hat.spec.decay_ms": 80.0, "hat.spec.is_open": False}
        result = resolve_hat_spec_params(params)
        assert result["hat"]["metal"]["amp"]["decay_ms"] == 80.0  # min(80, 100)
        assert result["hat"]["metal"]["amp"]["attack_ms"] == 0.0
        assert result["hat"]["is_open"] == False

    def test_open_hat(self):
        params = {"hat.spec.decay_ms": 800.0, "hat.spec.is_open": True}
        result = resolve_hat_spec_params(params)
        assert result["hat"]["metal"]["amp"]["decay_ms"] == 800.0  # max(800, 600)
        assert result["hat"]["is_open"] == True

    def test_open_hat_minimum_decay(self):
        params = {"hat.spec.decay_ms": 200.0, "hat.spec.is_open": True}
        result = resolve_hat_spec_params(params)
        assert result["hat"]["metal"]["amp"]["decay_ms"] == 600.0  # floor at 600ms

    def test_bool_conversion_nested(self):
        params = {"hat": {"spec": {"is_open": True, "choke_group": False}}}
        result = resolve_hat_spec_params(params)
        assert result["hat"]["is_open"] == True
        assert result["hat"]["choke_group"] == False

    def test_dissonance_to_jitter(self):
        params = {"hat.spec.dissonance": 0.5}
        result = resolve_hat_spec_params(params)
        assert result["hat"]["metal"]["ratio_jitter"] == pytest.approx(0.1)

    def test_fm_to_dirt(self):
        params = {"hat.spec.fm_amount": 1.0}
        result = resolve_hat_spec_params(params)
        assert result["dirt"] == pytest.approx(0.7)
