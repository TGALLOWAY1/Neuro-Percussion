"""
Oscillator generators with phase reset on trigger.
Ensures consistent phase for layering (avoids cancellation).
"""

import torch
import numpy as np

class Oscillator:
    @staticmethod
    def sine(frequency: torch.Tensor, duration: float, sample_rate: int, phase: float = 0.0, invert_phase: bool = False) -> torch.Tensor:
        """
        Generates a sine wave with phase reset on trigger.
        
        Args:
            frequency: Frequency (Hz) - can be scalar or tensor for FM
            duration: Duration in seconds
            sample_rate: Sample rate
            phase: Initial phase offset (radians) - defaults to 0 for phase reset
            invert_phase: If True, invert phase (useful for layering to avoid cancellation)
        
        Returns:
            Sine wave starting at phase=0 (or inverted)
        """
        t = torch.linspace(0, duration, int(duration * sample_rate))
        phase_offset = np.pi if invert_phase else 0.0
        return torch.sin(2 * np.pi * frequency * t + phase + phase_offset)

    @staticmethod
    def triangle(frequency: torch.Tensor, duration: float, sample_rate: int, phase: float = 0.0, invert_phase: bool = False) -> torch.Tensor:
        """
        Generates a triangle wave with phase reset on trigger.
        
        Args:
            frequency: Frequency (Hz) - can be scalar or tensor
            duration: Duration in seconds
            sample_rate: Sample rate
            phase: Initial phase offset (radians) - defaults to 0 for phase reset
            invert_phase: If True, invert waveform (useful for layering)
        
        Returns:
            Triangle wave starting at phase=0 (or inverted)
        """
        t = torch.linspace(0, duration, int(duration * sample_rate))
        # 2 * abs(2 * (t * freq - floor(t * freq + 0.5))) - 1
        phase_offset = np.pi if invert_phase else 0.0
        x = frequency * t + (phase + phase_offset) / (2 * np.pi)
        wave = 2 * torch.abs(2 * (x - torch.floor(x + 0.5))) - 1
        return -wave if invert_phase else wave

    @staticmethod
    def saw(frequency: torch.Tensor, duration: float, sample_rate: int, phase: float = 0.0) -> torch.Tensor:
        """Generates a sawtooth wave."""
        t = torch.linspace(0, duration, int(duration * sample_rate))
        x = frequency * t + phase / (2 * np.pi) 
        return 2 * (x - torch.floor(x + 0.5))

    @staticmethod
    def square(frequency: torch.Tensor, duration: float, sample_rate: int, phase: float = 0.0) -> torch.Tensor:
        """Generates a square wave."""
        t = torch.linspace(0, duration, int(duration * sample_rate))
        return torch.sign(torch.sin(2 * np.pi * frequency * t + phase))
