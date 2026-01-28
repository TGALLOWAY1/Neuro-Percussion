"""
Kick engine: sub, click, knock, room layers with optional per-layer ADSR and faders.
Macro params (punch_decay, click_amount, click_snap, blend, etc.) preserved; new params are optional.
"""
import logging
import torch
import numpy as np
from engine.dsp.envelopes import ADSR, ms_to_s
from engine.dsp.filters import Filter, Effects
from engine.dsp.delay import DelayLine
from engine.dsp.postchain import PostChain
from engine.dsp.mixer import LayerMixer, LayerSpec
from engine.core.params import get_param, get_db_gain

logger = logging.getLogger(__name__)


def _amp_env_for_layer(
    layer_name: str,
    params: dict,
    punch_decay: float,
    click_snap: float,
    duration_s: float,
    sample_rate: int,
) -> torch.Tensor:
    """Build per-layer amp ADSR from params or macro defaults. Returns envelope tensor."""
    prefix = f"kick.{layer_name}.amp"
    if layer_name == "sub":
        decay_ms = get_param(params, f"{prefix}.decay_ms", (0.1 + punch_decay * 0.4) * 1000)
        attack_ms = get_param(params, f"{prefix}.attack_ms", 0.0)
        sustain = get_param(params, f"{prefix}.sustain", 0.0)
        release_ms = get_param(params, f"{prefix}.release_ms", 0.0)
    elif layer_name == "click":
        decay_ms = get_param(params, f"{prefix}.decay_ms", (0.005 + click_snap * 0.02) * 1000)
        attack_ms = get_param(params, f"{prefix}.attack_ms", 0.0)
        sustain = get_param(params, f"{prefix}.sustain", 0.0)
        release_ms = get_param(params, f"{prefix}.release_ms", 0.0)
    elif layer_name == "knock":
        decay_ms = get_param(params, f"{prefix}.decay_ms", 50.0)
        attack_ms = get_param(params, f"{prefix}.attack_ms", 0.0)
        sustain = get_param(params, f"{prefix}.sustain", 0.0)
        release_ms = get_param(params, f"{prefix}.release_ms", 0.0)
    else:  # room
        decay_ms = get_param(params, f"{prefix}.decay_ms", 200.0)
        attack_ms = get_param(params, f"{prefix}.attack_ms", 0.0)
        sustain = get_param(params, f"{prefix}.sustain", 0.0)
        release_ms = get_param(params, f"{prefix}.release_ms", 0.0)
    try:
        attack_s = ms_to_s(float(attack_ms))
        decay_s = ms_to_s(float(decay_ms))
        release_s = ms_to_s(float(release_ms))
        sustain = float(sustain)
    except (TypeError, ValueError):
        attack_s, decay_s, release_s, sustain = 0.0, 0.1, 0.0, 0.0
    adsr = ADSR(sample_rate, attack_s, decay_s, sustain, release_s, hold_s=0.0, curve="exp")
    return adsr.render(duration_s, gate_s=duration_s)


class FMLayer:
    """
    Helper class for a single FM Physics layer.
    Osc 1 (Carrier) <- FM <- Osc 2 (Noise Modulator).
    """
    def __init__(self, sample_rate: int):
        self.sample_rate = sample_rate

    def render(self, 
               duration: float, 
               start_freq: float, 
               end_freq: float, 
               pitch_decay: float,
               amp_decay: float,
               fm_index_amt: float,
               fm_decay: float) -> torch.Tensor:
        num_samples = int(duration * self.sample_rate)
        t = torch.linspace(0, duration, num_samples)
        amp_env = torch.exp(-t / amp_decay)
        pitch_env = end_freq + (start_freq - end_freq) * torch.exp(-t / pitch_decay)
        fm_env = torch.exp(-t / fm_decay) * fm_index_amt
        noise_mod = torch.randn_like(t)
        inst_freq = pitch_env + (noise_mod * fm_env * 5000.0)
        inst_freq = torch.abs(inst_freq)
        phase = torch.cumsum(inst_freq / self.sample_rate, dim=0) * 2 * np.pi
        return torch.sin(phase) * amp_env


class KickEngine:
    def __init__(self, sample_rate: int = 48000):
        self.target_sr = sample_rate
        self.oversample_factor = 4
        self.sample_rate = sample_rate * self.oversample_factor
        self.delay_line = DelayLine(int(0.05 * self.sample_rate))
        self.layer_a = FMLayer(self.sample_rate)
        self.layer_b = FMLayer(self.sample_rate)

    def render(self, params: dict, seed: int = 0) -> torch.Tensor:
        torch.manual_seed(seed)
        duration = 0.5

        # Macro params (unchanged)
        punch_decay = params.get("punch_decay", 0.3)
        click_amount = params.get("click_amount", 0.5)
        click_snap = params.get("click_snap", 0.01)
        tune = params.get("tune", 45.0)
        room_tone_freq = params.get("room_tone_freq", 150.0)
        room_air = params.get("room_air", 0.3)
        distance_ms = params.get("distance_ms", 10.0)
        blend = params.get("blend", 0.3)

        self.delay_line.reset()

        # ---------- Layer A (punch + click source) ----------
        signal_a = self.layer_a.render(
            duration=duration,
            start_freq=150.0 + (click_amount * 100.0),
            end_freq=tune,
            pitch_decay=0.08,
            amp_decay=0.1 + (punch_decay * 0.4),
            fm_index_amt=click_amount,
            fm_decay=0.005 + (click_snap * 0.02),
        )

        # Split into sub (low) and click (high) for per-layer control
        crossover_hz = 120.0
        sub_audio = Filter.lowpass(signal_a, self.sample_rate, crossover_hz, q=0.707)
        click_audio = Filter.highpass(signal_a, self.sample_rate, crossover_hz, q=0.707)

        # ---------- Knock (damped sine, speaker knock) ----------
        freq_norm = get_param(params, "kick.knock.freq_norm", 0.5)
        try:
            freq_norm = float(freq_norm)
        except (TypeError, ValueError):
            freq_norm = 0.5
        freq_norm = max(0.0, min(1.0, freq_norm))
        knock_freq = 110.0 + (240.0 - 110.0) * freq_norm
        decay_ms = get_param(params, "kick.knock.decay_ms", 50.0)
        try:
            decay_ms = float(decay_ms)
        except (TypeError, ValueError):
            decay_ms = 50.0
        num_samples = signal_a.shape[-1]
        t = torch.linspace(0, duration, num_samples)
        knock_audio = torch.sin(2 * np.pi * knock_freq * t) * torch.exp(-t / (decay_ms / 1000.0 + 1e-6))
        knock_audio = knock_audio.float()

        # ---------- Room (Layer B delayed) ----------
        signal_b = self.layer_b.render(
            duration=duration,
            start_freq=room_tone_freq,
            end_freq=room_tone_freq,
            pitch_decay=1.0,
            amp_decay=0.2,
            fm_index_amt=room_air * 0.2,
            fm_decay=0.1,
        )
        block_size = 1024
        num_blocks = (len(signal_b) + block_size - 1) // block_size
        signal_b_delayed = torch.zeros_like(signal_b)
        delay_samples = (distance_ms / 1000.0) * self.sample_rate
        for i in range(num_blocks):
            start = i * block_size
            end = min(start + block_size, len(signal_b))
            chunk = signal_b[start:end]
            d_chunk = self.delay_line.read_block(delay_samples, len(chunk))
            self.delay_line.write_block(chunk)
            signal_b_delayed[start:end] = d_chunk
        room_audio = (signal_b_delayed * blend).float()

        # ---------- Per-layer amp ADSR ----------
        sr = self.sample_rate
        sub_env = _amp_env_for_layer("sub", params, punch_decay, click_snap, duration, sr)
        click_env = _amp_env_for_layer("click", params, punch_decay, click_snap, duration, sr)
        knock_env = _amp_env_for_layer("knock", params, punch_decay, click_snap, duration, sr)
        room_env = _amp_env_for_layer("room", params, punch_decay, click_snap, duration, sr)

        # Match envelope length to layer length (sample-accurate)
        def trim_env(env: torch.Tensor, length: int) -> torch.Tensor:
            if env.shape[-1] >= length:
                return env[..., :length].clone()
            return torch.nn.functional.pad(env, (0, length - env.shape[-1]))

        n = sub_audio.shape[-1]
        sub_audio = (sub_audio * trim_env(sub_env, n)).float()
        click_audio = (click_audio * trim_env(click_env, n)).float()
        knock_audio = (knock_audio * trim_env(knock_env, n)).float()
        room_audio = (room_audio * trim_env(room_env, n)).float()

        # ---------- LayerMixer: gains/mutes, sum ----------
        mixer = LayerMixer()
        mixer.add("sub", sub_audio)
        mixer.add("click", click_audio)
        mixer.add("knock", knock_audio)
        mixer.add("room", room_audio)
        default_specs = {
            "sub": LayerSpec("sub", gain_db=0.0, mute=False),
            "click": LayerSpec("click", gain_db=0.0, mute=False),
            "knock": LayerSpec("knock", gain_db=0.0, mute=False),
            "room": LayerSpec("room", gain_db=0.0, mute=False),
        }
        master, stems = mixer.mix(params, "kick", default_specs)

        # Saturation (preserve current behavior)
        drive = 1.0 + (click_amount * 0.5)
        master = torch.tanh(master * drive)

        # Downsample
        master = Filter.lowpass(master, self.sample_rate, self.target_sr / 2.0 - 1000)
        master = master[:: self.oversample_factor]

        if params.get("legacy_normalize", False):
            logger.warning("legacy_normalize enabled: this will cancel fader changes")
            peak = torch.max(torch.abs(master))
            if peak > 0:
                master = master / peak * 0.95

        master = PostChain.process(master, "kick", self.target_sr, params)
        return master
