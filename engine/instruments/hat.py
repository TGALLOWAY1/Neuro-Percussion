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

        tightness = params.get("tightness", 0.5)
        sheen = params.get("sheen", 0.5)
        dirt = params.get("dirt", 0.5)
        color = params.get("color", 0.5)

        # ---------- Metal ----------
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
        decay = 0.8 - (tightness * 0.76)
        master = master * torch.exp(-t / decay)

        # HPF (color)
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
