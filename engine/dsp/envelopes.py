import torch
import numpy as np
from typing import Union, Optional


# -----------------------------------------------------------------------------
# Helpers (reusable across envelopes and instruments)
# -----------------------------------------------------------------------------

def db_to_lin(db: float) -> float:
    """Convert decibels to linear gain. 0 dB -> 1.0."""
    return 10.0 ** (db / 20.0)


def ms_to_s(ms: float) -> float:
    """Convert milliseconds to seconds."""
    return ms / 1000.0


def clamp01(x: Union[float, torch.Tensor]) -> Union[float, torch.Tensor]:
    """Clamp value(s) to [0, 1]. Accepts scalar or tensor."""
    if isinstance(x, torch.Tensor):
        return torch.clamp(x, 0.0, 1.0)
    return max(0.0, min(1.0, float(x)))


# -----------------------------------------------------------------------------
# Legacy static envelope API (unchanged)
# -----------------------------------------------------------------------------

class Envelope:
    @staticmethod
    def exponential_decay(duration: float, sample_rate: int, decay_time: float) -> torch.Tensor:
        """
        Generates an exponential decay envelope.
        y(t) = e^(-t / decay_time)
        """
        num_samples = int(duration * sample_rate)
        t = torch.linspace(0, duration, num_samples)
        # Avoid division by zero if decay_time is tiny, though usually handled by caller logic
        return torch.exp(-t / (decay_time + 1e-6))

    @staticmethod
    def adsr(duration: float, sample_rate: int, attack: float, decay: float, sustain: float, release: float, gate_duration: float) -> torch.Tensor:
        """
        Generates an ADSR envelope. 
        Note: For one-shot drums, standard ADSR is less common than simple AR or AD, but included for completeness.
        If gate_duration is not provided, it acts like a "trigger" envelope (Attack -> Decay -> Sustain... -> Release at end?)
        Actually for One-Shots, it's usually Attack -> Decay -> Zero (Sustain=0).
        """
        num_samples = int(duration * sample_rate)
        env = torch.zeros(num_samples)
        
        attack_samples = int(attack * sample_rate)
        decay_samples = int(decay * sample_rate)
        gate_samples = int(gate_duration * sample_rate)
        release_samples = int(release * sample_rate)
        
        # 1. Attack
        # Linearly ramp from 0 to 1
        if attack_samples > 0:
            env[:attack_samples] = torch.linspace(0, 1, attack_samples)
            
        # 2. Decay
        # Exponential decay to Sustain level
        decay_end = min(attack_samples + decay_samples, num_samples)
        if decay_samples > 0 and decay_end > attack_samples:
             # Basic Linear decay implementation for now, or exponential?
             # Standard synth ADSR is usually linear or exponential. Let's do linear for simplicity of V1
            env[attack_samples:decay_end] = torch.linspace(1, sustain, decay_samples)
            
        # 3. Sustain
        sustain_end = min(gate_samples, num_samples)
        if sustain_end > decay_end:
            env[decay_end:sustain_end] = sustain
            
        # 4. Release
        # Decay from Sustain to 0
        release_end = min(sustain_end + release_samples, num_samples)
        if release_end > sustain_end:
            env[sustain_end:release_end] = torch.linspace(sustain, 0, release_end - sustain_end)
            
        return env


# -----------------------------------------------------------------------------
# Sample-accurate ADSR (per-layer, one-shot friendly)
# -----------------------------------------------------------------------------

class ADSR:
    """
    Sample-accurate ADSR envelope for offline one-shot rendering.
    Timeline: Attack -> Hold(at peak) -> Decay(to sustain) -> Sustain -> Release(to 0).
    If gate_s is None, gate is set to duration_s so release runs at the end of the buffer.
    """

    def __init__(
        self,
        sample_rate: int,
        attack_s: float,
        decay_s: float,
        sustain_level: float,
        release_s: float,
        hold_s: float = 0.0,
        curve: str = "exp",
    ):
        self.sample_rate = sample_rate
        self.attack_s = float(attack_s)
        self.decay_s = float(decay_s)
        self.sustain_level = float(clamp01(sustain_level))
        self.release_s = float(release_s)
        self.hold_s = float(hold_s)
        self.curve = curve if curve in ("linear", "exp") else "exp"

    def render(self, duration_s: float, gate_s: Optional[float] = None) -> torch.Tensor:
        """
        Generate envelope of length int(duration_s * sample_rate).
        gate_s: when the gate ends (release starts). If None, gate_s = duration_s.
        """
        n = int(duration_s * self.sample_rate)
        if n <= 0:
            return torch.zeros(1)

        t_all = torch.linspace(0, duration_s, n)
        env = torch.zeros(n)

        sr = self.sample_rate
        curve = self.curve

        # Segment boundaries in seconds and samples
        t_attack_end = self.attack_s
        t_hold_end = self.attack_s + self.hold_s
        t_decay_end = self.attack_s + self.hold_s + self.decay_s
        gate_t = duration_s if gate_s is None else float(gate_s)
        release_end_t = min(gate_t + self.release_s, duration_s)

        n_attack = max(0, int(t_attack_end * sr))
        n_hold_end = max(n_attack, int(t_hold_end * sr))
        n_decay_end = min(max(n_hold_end, int(t_decay_end * sr)), n)  # Clamp to buffer length
        n_gate = min(int(gate_t * sr), n)
        n_release_end = min(int(release_end_t * sr), n)

        # ---- Attack: 0 -> 1 ----
        if n_attack > 0:
            t = t_all[:n_attack]
            if curve == "exp":
                tau = (self.attack_s / 3.0) if self.attack_s > 0 else 1e-6
                env[:n_attack] = 1.0 - torch.exp(-t / tau)
            else:
                env[:n_attack] = t / self.attack_s

        # ---- Hold: stay at 1 ----
        if n_hold_end > n_attack:
            env[n_attack:n_hold_end] = 1.0

        # ---- Decay: 1 -> sustain_level ----
        decay_len = n_decay_end - n_hold_end
        if decay_len > 0:
            t = torch.linspace(0, self.decay_s, decay_len)
            if curve == "exp":
                tau = (self.decay_s / 3.0) if self.decay_s > 0 else 1e-6
                env[n_hold_end:n_decay_end] = self.sustain_level + (1.0 - self.sustain_level) * torch.exp(-t / tau)
            else:
                env[n_hold_end:n_decay_end] = torch.linspace(1.0, self.sustain_level, decay_len)

        # ---- Sustain: hold sustain_level until gate ----
        sustain_val = env[n_decay_end - 1] if n_decay_end > 0 else self.sustain_level
        sustain_end_sample = min(n_decay_end, n_gate)
        if n_gate > n_decay_end:
            env[n_decay_end:n_gate] = sustain_val

        # ---- Release: from level at gate -> 0 ----
        release_len = n_release_end - n_gate
        if release_len > 0:
            level_at_gate = float(env[n_gate - 1].item()) if n_gate > 0 else 0.0
            t = torch.linspace(0, self.release_s, release_len)
            if curve == "exp":
                tau = (self.release_s / 3.0) if self.release_s > 0 else 1e-6
                env[n_gate:n_release_end] = level_at_gate * torch.exp(-t / tau)
            else:
                env[n_gate:n_release_end] = torch.linspace(level_at_gate, 0.0, release_len)

        # Past release: zeros (buffer may extend beyond gate + release)
        if n_release_end < n:
            env[n_release_end:] = 0.0

        return env
