import torch
import numpy as np

class Oscillator:
    @staticmethod
    def sine(frequency: torch.Tensor, duration: float, sample_rate: int, phase: float = 0.0) -> torch.Tensor:
        """Generates a sine wave."""
        t = torch.linspace(0, duration, int(duration * sample_rate))
        return torch.sin(2 * np.pi * frequency * t + phase)

    @staticmethod
    def triangle(frequency: torch.Tensor, duration: float, sample_rate: int, phase: float = 0.0) -> torch.Tensor:
        """Generates a triangle wave."""
        t = torch.linspace(0, duration, int(duration * sample_rate))
        # 2 * abs(2 * (t * freq - floor(t * freq + 0.5))) - 1
        x = frequency * t + phase / (2 * np.pi)
        return 2 * torch.abs(2 * (x - torch.floor(x + 0.5))) - 1

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
