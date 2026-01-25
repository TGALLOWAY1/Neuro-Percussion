import torch
import numpy as np

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
