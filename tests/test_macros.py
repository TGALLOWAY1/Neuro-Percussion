"""
Unit tests for macro-to-advanced param mapping.
Tests that implied params change when macros change.
"""
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine.params.macros import apply_macros


def test_kick_macros_length_scales_decays():
    """Test that kick.macros.length_ms scales sub/knock/room decays."""
    # Short length
    params_short = {
        "kick": {
            "macros": {
                "length_ms": 250.0,  # half default
            }
        }
    }
    implied_short = apply_macros("kick", params_short)
    
    # Long length
    params_long = {
        "kick": {
            "macros": {
                "length_ms": 1000.0,  # double default
            }
        }
    }
    implied_long = apply_macros("kick", params_long)
    
    # Short should have shorter decays
    assert implied_short["kick"]["sub"]["amp"]["decay_ms"] < implied_long["kick"]["sub"]["amp"]["decay_ms"]
    assert implied_short["kick"]["knock"]["amp"]["decay_ms"] < implied_long["kick"]["knock"]["amp"]["decay_ms"]
    assert implied_short["kick"]["room"]["amp"]["decay_ms"] < implied_long["kick"]["room"]["amp"]["decay_ms"]
    
    print("✓ kick.macros.length_ms scales decays correctly")


def test_kick_macros_click_affects_gain():
    """Test that kick.macros.click affects click gain_db."""
    # Low click
    params_low = {
        "kick": {
            "macros": {
                "click": 0.0,
            }
        }
    }
    implied_low = apply_macros("kick", params_low)
    
    # High click
    params_high = {
        "kick": {
            "macros": {
                "click": 1.0,
            }
        }
    }
    implied_high = apply_macros("kick", params_high)
    
    # High click should have higher gain
    assert implied_high["kick"]["click"]["gain_db"] > implied_low["kick"]["click"]["gain_db"]
    
    print("✓ kick.macros.click affects click gain_db correctly")


def test_kick_macros_click_tight_affects_decay():
    """Test that kick.macros.click_tight affects click decay_ms."""
    # Loose click
    params_loose = {
        "kick": {
            "macros": {
                "click_tight": 0.0,
            }
        }
    }
    implied_loose = apply_macros("kick", params_loose)
    
    # Tight click
    params_tight = {
        "kick": {
            "macros": {
                "click_tight": 1.0,
            }
        }
    }
    implied_tight = apply_macros("kick", params_tight)
    
    # Tight should have shorter decay
    assert implied_tight["kick"]["click"]["amp"]["decay_ms"] < implied_loose["kick"]["click"]["amp"]["decay_ms"]
    
    print("✓ kick.macros.click_tight affects click decay_ms correctly")


def test_kick_macros_room_affects_gain_and_distance():
    """Test that kick.macros.room affects room gain_db and distance_ms."""
    # Low room
    params_low = {
        "kick": {
            "macros": {
                "room": 0.0,
            }
        }
    }
    implied_low = apply_macros("kick", params_low)
    
    # High room
    params_high = {
        "kick": {
            "macros": {
                "room": 1.0,
            }
        }
    }
    implied_high = apply_macros("kick", params_high)
    
    # High room should have higher gain and longer distance
    assert implied_high["kick"]["room"]["gain_db"] > implied_low["kick"]["room"]["gain_db"]
    assert implied_high["kick"]["room"]["distance_ms"] > implied_low["kick"]["room"]["distance_ms"]
    
    print("✓ kick.macros.room affects room gain_db and distance_ms correctly")


def test_snare_macros_body_affects_shell():
    """Test that snare.macros.body affects shell gain_db and decay_ms."""
    # Low body
    params_low = {
        "snare": {
            "macros": {
                "body": 0.0,
            }
        }
    }
    implied_low = apply_macros("snare", params_low)
    
    # High body
    params_high = {
        "snare": {
            "macros": {
                "body": 1.0,
            }
        }
    }
    implied_high = apply_macros("snare", params_high)
    
    # High body should have higher gain and longer decay
    assert implied_high["snare"]["shell"]["gain_db"] > implied_low["snare"]["shell"]["gain_db"]
    assert implied_high["snare"]["shell"]["amp"]["decay_ms"] > implied_low["snare"]["shell"]["amp"]["decay_ms"]
    
    print("✓ snare.macros.body affects shell gain_db and decay_ms correctly")


def test_snare_macros_wires_affects_gain_and_decay():
    """Test that snare.macros.wires affects wires gain_db and decay_ms."""
    # Low wires
    params_low = {
        "snare": {
            "macros": {
                "wires": 0.0,
            }
        }
    }
    implied_low = apply_macros("snare", params_low)
    
    # High wires
    params_high = {
        "snare": {
            "macros": {
                "wires": 1.0,
            }
        }
    }
    implied_high = apply_macros("snare", params_high)
    
    # High wires should have higher gain and longer decay
    assert implied_high["snare"]["wires"]["gain_db"] > implied_low["snare"]["wires"]["gain_db"]
    assert implied_high["snare"]["wires"]["amp"]["decay_ms"] > implied_low["snare"]["wires"]["amp"]["decay_ms"]
    
    print("✓ snare.macros.wires affects wires gain_db and decay_ms correctly")


def test_snare_macros_crack_affects_exciter():
    """Test that snare.macros.crack affects exciter gain_db."""
    # Low crack
    params_low = {
        "snare": {
            "macros": {
                "crack": 0.0,
            }
        }
    }
    implied_low = apply_macros("snare", params_low)
    
    # High crack
    params_high = {
        "snare": {
            "macros": {
                "crack": 1.0,
            }
        }
    }
    implied_high = apply_macros("snare", params_high)
    
    # High crack should have higher gain (or unmuted)
    assert implied_high["snare"]["exciter_body"]["gain_db"] > implied_low["snare"]["exciter_body"]["gain_db"]
    
    print("✓ snare.macros.crack affects exciter gain_db correctly")


def test_hat_macros_tightness_affects_decays():
    """Test that hat.macros.tightness shortens decays."""
    # Loose (low tightness)
    params_loose = {
        "hat": {
            "macros": {
                "tightness": 0.0,
            }
        }
    }
    implied_loose = apply_macros("hat", params_loose)
    
    # Tight (high tightness)
    params_tight = {
        "hat": {
            "macros": {
                "tightness": 1.0,
            }
        }
    }
    implied_tight = apply_macros("hat", params_tight)
    
    # Tight should have shorter decays
    assert implied_tight["hat"]["metal"]["amp"]["decay_ms"] < implied_loose["hat"]["metal"]["amp"]["decay_ms"]
    assert implied_tight["hat"]["air"]["amp"]["decay_ms"] < implied_loose["hat"]["air"]["amp"]["decay_ms"]
    
    print("✓ hat.macros.tightness shortens decays correctly")


def test_hat_macros_sheen_affects_air_gain():
    """Test that hat.macros.sheen affects air gain_db."""
    # Low sheen
    params_low = {
        "hat": {
            "macros": {
                "sheen": 0.0,
            }
        }
    }
    implied_low = apply_macros("hat", params_low)
    
    # High sheen
    params_high = {
        "hat": {
            "macros": {
                "sheen": 1.0,
            }
        }
    }
    implied_high = apply_macros("hat", params_high)
    
    # High sheen should have higher air gain
    assert implied_high["hat"]["air"]["gain_db"] > implied_low["hat"]["air"]["gain_db"]
    
    print("✓ hat.macros.sheen affects air gain_db correctly")


def test_hat_macros_chick_affects_gain():
    """Test that hat.macros.chick affects chick gain_db."""
    # Low chick
    params_low = {
        "hat": {
            "macros": {
                "chick": 0.0,
            }
        }
    }
    implied_low = apply_macros("hat", params_low)
    
    # High chick
    params_high = {
        "hat": {
            "macros": {
                "chick": 1.0,
            }
        }
    }
    implied_high = apply_macros("hat", params_high)
    
    # High chick should have higher gain
    assert implied_high["hat"]["chick"]["gain_db"] > implied_low["hat"]["chick"]["gain_db"]
    
    print("✓ hat.macros.chick affects chick gain_db correctly")


def test_user_advanced_params_win():
    """Test that user-provided advanced params are not overwritten."""
    params = {
        "kick": {
            "macros": {
                "click": 1.0,  # would imply high gain
            },
            "click": {
                "gain_db": -12.0,  # user override
            }
        }
    }
    implied = apply_macros("kick", params)
    
    # User-provided value should NOT be in implied (user wins)
    assert "gain_db" not in implied.get("kick", {}).get("click", {})
    
    print("✓ User-provided advanced params are not overwritten")


def test_no_macros_returns_empty():
    """Test that apply_macros returns empty dict when no macros present."""
    params = {
        "kick": {
            "click": {
                "gain_db": -6.0,
            }
        }
    }
    implied = apply_macros("kick", params)
    
    assert implied == {}
    
    print("✓ No macros returns empty dict")


if __name__ == "__main__":
    print("Running macro mapping tests...\n")
    
    test_kick_macros_length_scales_decays()
    test_kick_macros_click_affects_gain()
    test_kick_macros_click_tight_affects_decay()
    test_kick_macros_room_affects_gain_and_distance()
    test_snare_macros_body_affects_shell()
    test_snare_macros_wires_affects_gain_and_decay()
    test_snare_macros_crack_affects_exciter()
    test_hat_macros_tightness_affects_decays()
    test_hat_macros_sheen_affects_air_gain()
    test_hat_macros_chick_affects_gain()
    test_user_advanced_params_win()
    test_no_macros_returns_empty()
    
    print("\n✅ All macro mapping tests passed!")
