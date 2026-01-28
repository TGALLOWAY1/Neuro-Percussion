"""
Snare engine: exciter_body, exciter_air, shell, wires, room layers with
per-layer faders/mute and AMP ADSR. Macro params (tone, wire, crack, body) preserved.
Shell uses stateful one-pole LPF and 4x4 Hadamard feedback matrix.
"""
import logging
import torch
import numpy as np
from engine.dsp.oscillators import Oscillator
from engine.dsp.envelopes import ADSR, ms_to_s
from engine.dsp.filters import Filter, Effects
from engine.dsp.delay import DelayLine
from engine.dsp.postchain import PostChain
from engine.dsp.mixer import LayerMixer, LayerSpec
from engine.core.params import get_param

logger = logging.getLogger(__name__)

# 4x4 Hadamard (normalized), delay i receives sum_j H[i,j] * d_j
_HADAMARD_4 = 0.5 * torch.tensor(
    [[1, 1, 1, 1], [1, -1, 1, -1], [1, 1, -1, -1], [1, -1, -1, 1]], dtype=torch.float32
)


class _OnePoleLPF:
    """Stateful one-pole LPF: y[n] = a*x[n] + (1-a)*y[n-1], a = 1 - exp(-2*pi*fc/sr)."""

    def __init__(self, sample_rate: int):
        self.sr = sample_rate
        self._y_prev = 0.0

    def reset(self):
        self._y_prev = 0.0

    def process(self, x: torch.Tensor, cutoff_hz: float) -> torch.Tensor:
        n = x.shape[-1]
        fc = min(max(cutoff_hz, 10.0), self.sr / 2 - 1)
        a = 1.0 - np.exp(-2.0 * np.pi * fc / self.sr)
        out = torch.zeros_like(x)
        for i in range(n):
            out[..., i] = a * x[..., i] + (1.0 - a) * self._y_prev
            self._y_prev = out[..., i].item()
        return out


def _snare_amp_env(
    layer: str,
    params: dict,
    tone: float,
    wire_amt: float,
    crack_amt: float,
    body_amt: float,
    duration_s: float,
    sample_rate: int,
) -> torch.Tensor:
    prefix = f"snare.{layer}.amp"
    if layer == "exciter_body":
        decay_ms = get_param(params, f"{prefix}.decay_ms", 50.0)  # ~exp(-t*20) -> 50ms
        attack_ms = get_param(params, f"{prefix}.attack_ms", 0.0)
        sustain = get_param(params, f"{prefix}.sustain", 0.0)
        release_ms = get_param(params, f"{prefix}.release_ms", 0.0)
    elif layer == "exciter_air":
        decay_ms = get_param(params, f"{prefix}.decay_ms", 20.0)  # ~exp(-t*50) -> 20ms
        attack_ms = get_param(params, f"{prefix}.attack_ms", 0.0)
        sustain = get_param(params, f"{prefix}.sustain", 0.0)
        release_ms = get_param(params, f"{prefix}.release_ms", 0.0)
    elif layer == "shell":
        decay_ms = get_param(params, f"{prefix}.decay_ms", 500.0)  # default flat within 0.5s (recreate current)
        attack_ms = get_param(params, f"{prefix}.attack_ms", 0.0)
        sustain = get_param(params, f"{prefix}.sustain", 1.0)
        release_ms = get_param(params, f"{prefix}.release_ms", 0.0)
    elif layer == "wires":
        decay_ms = get_param(params, f"{prefix}.decay_ms", 500.0)  # default flat; wire_env baked in
        attack_ms = get_param(params, f"{prefix}.attack_ms", 0.0)
        sustain = get_param(params, f"{prefix}.sustain", 1.0)
        release_ms = get_param(params, f"{prefix}.release_ms", 0.0)
    else:  # room
        decay_ms = get_param(params, f"{prefix}.decay_ms", 400.0)
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


def _trim_env(env: torch.Tensor, length: int) -> torch.Tensor:
    if env.shape[-1] >= length:
        return env[..., :length].clone()
    return torch.nn.functional.pad(env, (0, length - env.shape[-1]))


class SnareEngine:
    def __init__(self, sample_rate: int = 48000):
        self.target_sr = sample_rate
        self.oversample_factor = 2
        self.sample_rate = sample_rate * self.oversample_factor
        self.delays = [DelayLine(10000) for _ in range(4)]
        self._lpfs = [_OnePoleLPF(self.sample_rate) for _ in range(4)]

    def render(self, params: dict, seed: int = 0) -> torch.Tensor:
        torch.manual_seed(seed)
        duration = 0.5
        num_samples = int(duration * self.sample_rate)
        t = torch.linspace(0, duration, num_samples)

        tone = params.get("tone", 0.5)
        wire_amt = params.get("wire", 0.5)
        crack_amt = params.get("crack", 0.5)
        body_amt = params.get("body", 0.5)

        fund_freq = 150.0 + (tone * 150.0)
        for d in self.delays:
            d.reset()
        for lp in self._lpfs:
            lp.reset()

        # ---------- Exciter: body and air (explicit layers) ----------
        osc_body = Oscillator.triangle(fund_freq, duration, self.sample_rate)
        osc_body = (osc_body * torch.exp(-t * 20)).float()
        osc_air = (torch.rand_like(t) * 2 - 1) * torch.exp(-t * 50)
        osc_air = osc_air.float()

        exciter = (osc_body * 0.6) + (osc_air * 0.4)
        boost_gain = 2.0 + (crack_amt * 2.0)
        bp_2k = Filter.bandpass(exciter, self.sample_rate, 2000.0, q=1.5)
        exciter_eq = exciter + (bp_2k * boost_gain)
        exciter_clipped = Effects.hard_clip(exciter_eq, threshold_db=-2.0)

        # ---------- Shell (FDN with Hadamard + stateful LPF) ----------
        detune_cents = torch.tensor([0.0, 5.0, -7.0, 12.0])
        pitch_mults = torch.pow(2.0, detune_cents / 1200.0)
        actual_freqs = fund_freq * pitch_mults
        delay_lens = self.sample_rate / actual_freqs
        feedback_gain = 0.85 + (body_amt * 0.11)

        block_size = 32
        shell_out = torch.zeros(num_samples, dtype=torch.float32)
        H = _HADAMARD_4

        for b in range(0, num_samples, block_size):
            end = min(b + block_size, num_samples)
            chunk_len = end - b
            in_chunk = exciter_clipped[b:end]

            # Read from delays
            d_sigs = [
                self.delays[i].read_block(float(delay_lens[i].item()), chunk_len)
                for i in range(4)
            ]
            # Hadamard: out_i = sum_j H[i,j] * d_j
            out_blocks = []
            for i in range(4):
                u = sum(H[i, j].item() * d_sigs[j] for j in range(4))
                input_amp = float(torch.max(torch.abs(in_chunk))) if chunk_len > 0 else 0.0
                lpf_cutoff = 2000.0 + (input_amp * 8000.0)
                u = self._lpfs[i].process(u.unsqueeze(0), lpf_cutoff).squeeze(0)
                u = Effects.soft_clip(u, threshold_db=-1.0)
                mix_sig = in_chunk + (u * feedback_gain)
                out_blocks.append(mix_sig)
                self.delays[i].write_block(mix_sig)

            shell_out[b:end] = (out_blocks[0] + out_blocks[1] + out_blocks[2] + out_blocks[3]) / 4.0

        # ---------- Wires: BP sweep 9k -> 3.5k over 50ms + ghost floor ----------
        noise = torch.randn_like(t)
        sweep_duration_s = 0.05
        n_sweep = int(sweep_duration_s * self.sample_rate)
        n_sweep = min(n_sweep, num_samples)
        t_sweep = torch.linspace(0, 1, n_sweep)
        center_sweep = 9000.0 - (9000.0 - 3500.0) * t_sweep
        wires_sig = torch.zeros_like(t)
        chunk = 256
        for i in range(0, n_sweep, chunk):
            end_i = min(i + chunk, n_sweep)
            seg = noise[i:end_i]
            mid = (i + end_i) // 2
            fc = float(center_sweep[mid].item())
            seg_bp = Filter.bandpass(seg, self.sample_rate, fc, q=0.8)
            wires_sig[i:end_i] = seg_bp
        if n_sweep < num_samples:
            tail_bp = Filter.bandpass(noise[n_sweep:], self.sample_rate, 3500.0, q=0.8)
            wires_sig[n_sweep:] = tail_bp
        wire_decay_t = 0.2 + (wire_amt * 0.3)
        wire_env = torch.exp(-t / wire_decay_t)
        ghost_floor = 0.08
        wires_out = wires_sig * wire_env * (wire_amt * (1.0 - ghost_floor) + ghost_floor)
        wires_out = wires_out.float()

        # ---------- Room (optional send from shell) ----------
        room_out = Filter.lowpass(shell_out, self.sample_rate, 800.0, q=0.707) * 0.15
        room_out = room_out.float()

        # ---------- Per-layer AMP ADSR ----------
        sr = self.sample_rate
        layers = ("exciter_body", "exciter_air", "shell", "wires", "room")
        envs = {
            layer: _snare_amp_env(
                layer, params, tone, wire_amt, crack_amt, body_amt, duration, sr
            )
            for layer in layers
        }
        exciter_body = (osc_body * _trim_env(envs["exciter_body"], num_samples)).float()
        exciter_air = (osc_air * _trim_env(envs["exciter_air"], num_samples)).float()
        shell_layer = (shell_out * _trim_env(envs["shell"], num_samples)).float()
        wires_layer = (wires_out * _trim_env(envs["wires"], num_samples)).float()
        room_layer = (room_out * _trim_env(envs["room"], num_samples)).float()

        # ---------- LayerMixer ----------
        mixer = LayerMixer()
        mixer.add("exciter_body", exciter_body)
        mixer.add("exciter_air", exciter_air)
        mixer.add("shell", shell_layer)
        mixer.add("wires", wires_layer)
        mixer.add("room", room_layer)
        # Default: exciter stems muted so output = shell + wires (current behavior)
        default_specs = {
            "exciter_body": LayerSpec("exciter_body", gain_db=-200.0, mute=True),
            "exciter_air": LayerSpec("exciter_air", gain_db=-200.0, mute=True),
            "shell": LayerSpec("shell", gain_db=0.0, mute=False),
            "wires": LayerSpec("wires", gain_db=0.0, mute=False),
            "room": LayerSpec("room", gain_db=-200.0, mute=True),
        }
        # Override wires default gain by macro: wires layer level from wire_amt
        # Current: wires_out already has wire_amt in it. So we pass wires_layer and default 0 dB; level is baked in.
        # To let fader override we use gain_db 0 and wires_layer has wire_amt baked in. Good.
        master, _ = mixer.mix(params, "snare", default_specs)

        # Master HPF
        master = Filter.highpass(master, self.sample_rate, 80.0)
        master = master[:: self.oversample_factor]

        if params.get("legacy_normalize", False):
            logger.warning("legacy_normalize enabled: this will cancel fader changes")
            peak = torch.max(torch.abs(master))
            if peak > 0:
                master = master / peak * 0.95

        master = PostChain.process(master, "snare", self.target_sr, params)
        return master
