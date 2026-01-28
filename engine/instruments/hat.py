"""
Hi-hat engine: metal, air, chick layers with per-layer faders/mute and AMP ADSR.
Dirt is nonlinear coloration (pre-emphasis -> saturation -> de-emphasis), not a separate source.
Macro params (tightness, sheen, dirt, color) preserved. Pink noise for air.
"""
import logging
import torch
import numpy as np
from engine.dsp.envelopes import ADSR, ms_to_s
from engine.dsp.filters import Filter, Effects
from engine.dsp.noise import Noise
from engine.dsp.postchain import PostChain
from engine.dsp.mixer import LayerMixer, LayerSpec
from engine.core.params import get_param

logger = logging.getLogger(__name__)


def resolve_hat_spec_params(params: dict) -> dict:
    """
    Map hat.spec.* parameters to internal params.
    Only applies if any hat.spec.* keys exist.
    User-provided advanced params take precedence (not overwritten).
    
    Returns a dict of implied internal params that should be merged with user params.
    """
    # Check if spec params exist
    spec_prefix = "hat.spec."
    has_spec = any(key.startswith(spec_prefix) for key in params.keys()) or (
        "hat" in params and isinstance(params.get("hat"), dict) and "spec" in params.get("hat", {})
    )
    
    if not has_spec:
        return {}
    
    implied = {}
    
    # Helper to get spec param with default
    def get_spec(key: str, default: float) -> float:
        # Try nested: params["hat"]["spec"][key]
        if "hat" in params and isinstance(params["hat"], dict):
            if "spec" in params["hat"] and isinstance(params["hat"]["spec"], dict):
                if key in params["hat"]["spec"]:
                    try:
                        val = params["hat"]["spec"][key]
                        # Handle bool conversion for is_open and choke_group
                        if key in ("is_open", "choke_group") and isinstance(val, bool):
                            return 1.0 if val else 0.0
                        return float(val)
                    except (TypeError, ValueError):
                        pass
        # Try flat: params["hat.spec.key"]
        flat_key = f"hat.spec.{key}"
        val = get_param(params, flat_key, default)
        try:
            if key in ("is_open", "choke_group") and isinstance(val, bool):
                return 1.0 if val else 0.0
            return float(val)
        except (TypeError, ValueError):
            return default
    
    # Get spec values
    metal_pitch_hz = get_spec("metal_pitch_hz", 800.0)
    dissonance = get_spec("dissonance", 0.7)
    fm_amount = get_spec("fm_amount", 0.5)
    hpf_hz = get_spec("hpf_hz", 3000.0)
    color_hz = get_spec("color_hz", 8000.0)
    decay_ms = get_spec("decay_ms", 80.0)
    choke_group = get_spec("choke_group", 1.0)  # default true
    is_open = get_spec("is_open", 0.0)  # default false
    attack_ms = get_spec("attack_ms", 0.0)
    
    # Clamp to safe ranges
    metal_pitch_hz = max(300.0, min(10000.0, metal_pitch_hz))
    dissonance = max(0.0, min(1.0, dissonance))
    fm_amount = max(0.0, min(1.0, fm_amount))
    hpf_hz = max(300.0, min(8000.0, hpf_hz))
    color_hz = max(2000.0, min(15000.0, color_hz))
    decay_ms = max(20.0, min(2000.0, decay_ms))
    attack_ms = max(0.0, min(10.0, attack_ms))
    
    # Check if user already provided these params
    def has_user(key: str) -> bool:
        keys = key.split(".")
        current = params
        for k in keys:
            if not isinstance(current, dict) or k not in current:
                return False
            current = current[k]
        return True
    
    # Map to internal params (only if user didn't provide them)
    
    # Metal pitch
    if not has_user("hat.metal.base_hz"):
        implied.setdefault("hat", {}).setdefault("metal", {})["base_hz"] = metal_pitch_hz
    
    # Dissonance -> ratio_jitter
    if not has_user("hat.metal.ratio_jitter"):
        # Map dissonance (0..1) to jitter (0..0.2 typical)
        implied.setdefault("hat", {}).setdefault("metal", {})["ratio_jitter"] = dissonance * 0.2
    
    # FM amount -> dirt (conservative mapping)
    if not has_user("dirt"):
        # Map fm_amount to dirt conservatively (0..1 -> 0..0.7)
        implied["dirt"] = fm_amount * 0.7
    
    # HPF
    if not has_user("hat.hpf_hz"):
        implied.setdefault("hat", {})["hpf_hz"] = hpf_hz
    
    # Color emphasis (BP center)
    if not has_user("hat.color_hz"):
        implied.setdefault("hat", {})["color_hz"] = color_hz
    
    # Envelope mapping (open vs closed)
    if is_open > 0.5:
        # Open hat: longer decay, small attack
        open_decay_ms = max(decay_ms, 600.0)  # Ensure at least 600ms for open
        open_attack_ms = attack_ms if attack_ms > 0 else 5.0
        if not has_user("hat.metal.amp.decay_ms"):
            implied.setdefault("hat", {}).setdefault("metal", {}).setdefault("amp", {})["decay_ms"] = open_decay_ms
        if not has_user("hat.metal.amp.attack_ms"):
            implied.setdefault("hat", {}).setdefault("metal", {}).setdefault("amp", {})["attack_ms"] = open_attack_ms
        if not has_user("hat.air.amp.decay_ms"):
            implied.setdefault("hat", {}).setdefault("air", {}).setdefault("amp", {})["decay_ms"] = open_decay_ms
        if not has_user("hat.air.amp.attack_ms"):
            implied.setdefault("hat", {}).setdefault("air", {}).setdefault("amp", {})["attack_ms"] = open_attack_ms
    else:
        # Closed hat: shorter decay, no attack
        closed_decay_ms = min(decay_ms, 100.0)  # Cap at 100ms for closed
        if not has_user("hat.metal.amp.decay_ms"):
            implied.setdefault("hat", {}).setdefault("metal", {}).setdefault("amp", {})["decay_ms"] = closed_decay_ms
        if not has_user("hat.metal.amp.attack_ms"):
            implied.setdefault("hat", {}).setdefault("metal", {}).setdefault("amp", {})["attack_ms"] = 0.0
        if not has_user("hat.air.amp.decay_ms"):
            implied.setdefault("hat", {}).setdefault("air", {}).setdefault("amp", {})["decay_ms"] = closed_decay_ms
        if not has_user("hat.air.amp.attack_ms"):
            implied.setdefault("hat", {}).setdefault("air", {}).setdefault("amp", {})["attack_ms"] = 0.0
    
    # Chick layer (always short)
    if not has_user("hat.chick.amp.decay_ms"):
        implied.setdefault("hat", {}).setdefault("chick", {}).setdefault("amp", {})["decay_ms"] = 5.0
    
    # Choke group (store as param for render tool to use)
    if not has_user("hat.choke_group"):
        implied.setdefault("hat", {})["choke_group"] = bool(choke_group > 0.5)
    
    # is_open flag
    if not has_user("hat.is_open"):
        implied.setdefault("hat", {})["is_open"] = bool(is_open > 0.5)
    
    return implied


def _hat_amp_env(
    layer: str,
    params: dict,
    tightness: float,
    duration_s: float,
    sample_rate: int,
) -> torch.Tensor:
    """Per-layer amp ADSR. Default flat (sustain=1) so global decay controls level; override via params."""
    prefix = f"hat.{layer}.amp"
    decay_s_default = 0.8 - (tightness * 0.76)
    decay_ms = get_param(params, f"{prefix}.decay_ms", decay_s_default * 1000)
    attack_ms = get_param(params, f"{prefix}.attack_ms", 0.0)
    sustain = get_param(params, f"{prefix}.sustain", 1.0)  # default flat
    release_ms = get_param(params, f"{prefix}.release_ms", 0.0)
    try:
        attack_s = ms_to_s(float(attack_ms))
        decay_s = ms_to_s(float(decay_ms))
        release_s = ms_to_s(float(release_ms))
        sustain = float(sustain)
    except (TypeError, ValueError):
        attack_s, decay_s, release_s, sustain = 0.0, 0.5, 0.0, 1.0
    # Clamp decay so ADSR fits in buffer (0.5s)
    decay_s = min(decay_s, duration_s * 0.99)
    adsr = ADSR(sample_rate, attack_s, decay_s, sustain, release_s, hold_s=0.0, curve="exp")
    return adsr.render(duration_s, gate_s=duration_s)


def _trim_env(env: torch.Tensor, length: int) -> torch.Tensor:
    if env.shape[-1] >= length:
        return env[..., :length].clone()
    return torch.nn.functional.pad(env, (0, length - env.shape[-1]))


def _apply_dirt_wavefold(mix: torch.Tensor, dirt: float, sample_rate: int) -> torch.Tensor:
    """Dirt as pre-emphasis -> saturation/wavefold -> de-emphasis. No bitcrush."""
    if dirt <= 0:
        return mix
    drive = 1.0 + (dirt * 2.0)
    # Pre-emphasis: simple high-shelf-ish (boost highs)
    mix_pe = Filter.highpass(mix, sample_rate, 4000.0, q=0.5) * (dirt * 0.5) + mix
    mix_pe = mix_pe * drive
    mix_sat = torch.tanh(mix_pe)
    # De-emphasis: compensate high boost
    mix_out = mix_sat - Filter.highpass(mix_sat, sample_rate, 4000.0, q=0.5) * (dirt * 0.3)
    return mix_out


def _apply_dirt_legacy_bitcrush(mix: torch.Tensor, dirt: float, sample_rate: int) -> torch.Tensor:
    """Legacy bitcrush path (sample-rate reduction)."""
    if dirt <= 0:
        return mix
    target_crush = 48000.0 - (dirt * 36000.0)
    factor = max(1, int(sample_rate / target_crush))
    if factor <= 1:
        return mix
    mix = mix.clone()
    for i in range(0, len(mix), factor):
        val = mix[i]
        end_idx = min(i + factor, len(mix))
        mix[i:end_idx] = val
    return mix


class HatEngine:
    def __init__(self, sample_rate: int = 48000):
        self.target_sr = sample_rate
        self.oversample_factor = 4
        self.sample_rate = sample_rate * self.oversample_factor

    def render(self, params: dict, seed: int = 0) -> torch.Tensor:
        torch.manual_seed(seed)
        duration = 0.5
        num_samples = int(duration * self.sample_rate)
        t = torch.linspace(0, duration, num_samples)

        # Apply spec param mapping if spec params exist
        spec_implied = resolve_hat_spec_params(params)
        if spec_implied:
            # Deep merge spec-implied params into params (user params still win)
            import copy
            def _deep_merge_spec(base: dict, override: dict) -> dict:
                result = copy.deepcopy(base)
                for key, value in override.items():
                    if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                        result[key] = _deep_merge_spec(result[key], value)
                    else:
                        # Only add if key doesn't exist (user params win)
                        if key not in result:
                            result[key] = copy.deepcopy(value)
                return result
            params = _deep_merge_spec(params, spec_implied)

        tightness = params.get("tightness", 0.5)
        sheen = params.get("sheen", 0.5)
        dirt = params.get("dirt", 0.5)
        color = params.get("color", 0.5)

        # ---------- Metal ----------
        # Use spec metal_pitch_hz if available, otherwise fall back to macro
        metal_base_hz = get_param(params, "hat.metal.base_hz", None)
        if metal_base_hz is not None:
            base_hz = metal_base_hz
        else:
            base_hz = 300.0 + (color * 200.0)
        ratios = torch.tensor([1.0, 1.5, 1.6, 1.8, 2.2, 3.2])
        jitter = get_param(params, "hat.metal.ratio_jitter", 0.1)
        try:
            jitter = float(jitter)
        except (TypeError, ValueError):
            jitter = 0.1
        ratios = ratios * (1.0 + (torch.rand(6) * jitter))

        metal_sum = torch.zeros_like(t)
        for r in ratios:
            freq = base_hz * r.item()
            phase_offset = torch.rand(1).item() * 2 * np.pi
            osc = torch.sign(torch.sin(2 * np.pi * freq * t + phase_offset))
            metal_sum += osc

        # Apply color emphasis (BP at color_hz if spec param exists)
        color_hz = get_param(params, "hat.color_hz", None)
        if color_hz is not None:
            # Use spec color_hz for BP emphasis
            bp_color = Filter.bandpass(metal_sum, self.sample_rate, color_hz, q=3.0)
            # Also keep some of the original bands for richness
            bp1 = Filter.bandpass(metal_sum, self.sample_rate, min(6000.0, color_hz * 0.75), q=3.0)
            bp2 = Filter.bandpass(metal_sum, self.sample_rate, color_hz, q=4.0)
            bp3 = Filter.bandpass(metal_sum, self.sample_rate, min(12000.0, color_hz * 1.5), q=5.0)
            metal_layer = (bp1 + bp2 * 1.5 + bp3) * 0.4  # Emphasize color band
        else:
            # Legacy mode: fixed bands
            bp1 = Filter.bandpass(metal_sum, self.sample_rate, 6000.0, q=3.0)
            bp2 = Filter.bandpass(metal_sum, self.sample_rate, 9000.0, q=4.0)
            bp3 = Filter.bandpass(metal_sum, self.sample_rate, 12000.0, q=5.0)
            metal_layer = (bp1 + bp2 + bp3) * 0.5
        metal_layer = metal_layer.float()

        # ---------- Air (pink noise) ----------
        pink = Noise.pink(duration, self.sample_rate)
        if pink.shape[-1] != num_samples:
            pink = pink[:num_samples] if pink.shape[-1] >= num_samples else torch.nn.functional.pad(pink, (0, num_samples - pink.shape[-1]))
        pink = pink.to(metal_layer.dtype)
        # Use spec hpf_hz for air if available, otherwise legacy
        air_hpf_hz = get_param(params, "hat.hpf_hz", None)
        if air_hpf_hz is not None:
            air_cut = air_hpf_hz
        else:
            air_cut = 7000.0
        air_layer = Filter.highpass(pink, self.sample_rate, air_cut) * (sheen * 0.5 + 0.2)
        air_layer = air_layer.float()

        # ---------- Chick ----------
        click_dur = max(1, int(0.002 * self.sample_rate))
        click = torch.zeros(num_samples, dtype=torch.float32)
        click[:click_dur] = torch.randn(click_dur, dtype=torch.float32)
        chick_layer = Filter.highpass(click, self.sample_rate, 4000.0) * 0.5
        chick_layer = chick_layer.float()

        # ---------- Per-layer AMP ADSR ----------
        sr = self.sample_rate
        env_metal = _hat_amp_env("metal", params, tightness, duration, sr)
        env_air = _hat_amp_env("air", params, tightness, duration, sr)
        env_chick = _hat_amp_env("chick", params, tightness, duration, sr)

        metal_layer = metal_layer * _trim_env(env_metal, num_samples)
        air_layer = air_layer * _trim_env(env_air, num_samples)
        chick_layer = chick_layer * _trim_env(env_chick, num_samples)

        # ---------- LayerMixer ----------
        mixer = LayerMixer()
        mixer.add("metal", metal_layer)
        mixer.add("air", air_layer)
        mixer.add("chick", chick_layer)
        default_specs = {
            "metal": LayerSpec("metal", gain_db=0.0, mute=False),
            "air": LayerSpec("air", gain_db=0.0, mute=False),
            "chick": LayerSpec("chick", gain_db=0.0, mute=False),
        }
        master, _ = mixer.mix(params, "hat", default_specs)

        # Global decay (tightness) on sum – matches original behavior
        # Only apply if not using spec decay (spec decay is handled by per-layer ADSR)
        spec_decay_ms = get_param(params, "hat.spec.decay_ms", None)
        if spec_decay_ms is None:
            decay = 0.8 - (tightness * 0.76)
            master = master * torch.exp(-t / decay)

        # HPF (use spec hpf_hz if available, otherwise legacy color-based)
        hpf_hz = get_param(params, "hat.hpf_hz", None)
        if hpf_hz is not None:
            master = Filter.highpass(master, self.sample_rate, hpf_hz)
        else:
            # Legacy mode: color-based HPF
            master = Filter.highpass(master, self.sample_rate, 3000.0 + (color * 1000.0))

        # ---------- Dirt: wavefold/sat by default; optional legacy bitcrush ----------
        legacy_bitcrush = bool(get_param(params, "hat.dirt.legacy_bitcrush", False))
        if legacy_bitcrush:
            master = _apply_dirt_legacy_bitcrush(master, dirt, self.sample_rate)
            master = master * (1.0 + dirt)
            master = torch.tanh(master)
        else:
            master = _apply_dirt_wavefold(master, dirt, self.sample_rate)

        # Downsample
        master = Filter.lowpass(master, self.sample_rate, self.target_sr / 2.0 - 1000)
        master = master[:: self.oversample_factor]

        if params.get("legacy_normalize", False):
            logger.warning("legacy_normalize enabled: this will cancel fader changes")
            peak = torch.max(torch.abs(master))
            if peak > 0:
                master = master / peak * 0.95

        master = PostChain.process(master, "hat", self.target_sr, params)
        return master
