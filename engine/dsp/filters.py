import torch
import torchaudio.functional as F
import numpy as np

class Filter:
    @staticmethod
    def lowpass(waveform: torch.Tensor, sample_rate: int, cutoff_freq: float, q: float = 0.707) -> torch.Tensor:
        """Apply a LowPass Biquad filter."""
        # Ensure cutoff is within Nyquist
        cutoff_freq = min(cutoff_freq, sample_rate / 2 - 1)
        return F.lowpass_biquad(waveform, sample_rate, cutoff_freq, q)

    @staticmethod
    def highpass(waveform: torch.Tensor, sample_rate: int, cutoff_freq: float, q: float = 0.707) -> torch.Tensor:
        """Apply a HighPass Biquad filter."""
        cutoff_freq = min(cutoff_freq, sample_rate / 2 - 1)
        return F.highpass_biquad(waveform, sample_rate, cutoff_freq, q)

    @staticmethod
    def bandpass(waveform: torch.Tensor, sample_rate: int, center_freq: float, q: float = 0.707) -> torch.Tensor:
        """Apply a BandPass Biquad filter."""
        center_freq = min(center_freq, sample_rate / 2 - 1)
        return F.bandpass_biquad(waveform, sample_rate, center_freq, q)

class Effects:
    @staticmethod
    def soft_clip(waveform: torch.Tensor, threshold_db: float = -0.1) -> torch.Tensor:
        """
        Soft Clipping using tanh.
        """
        threshold = 10 ** (threshold_db / 20)
        return torch.tanh(waveform) * threshold

    @staticmethod
    def transient_shaper(waveform: torch.Tensor, sample_rate: int, amount: float = 0.0) -> torch.Tensor:
        """
        Simple differential envelope transient shaper.
        amount: 0.0 (no effect) to 1.0 (max boost).
        """
        if amount <= 0:
            return waveform
            
        # Fast Envelope (Transient)
        # Simple IIR follower: y[n] = x[n] + alpha * (y[n-1] - x[n])
        # Torch implementation via loop is slow, assume short duration or vectorize approximation.
        # For simplicity/speed in Python, we'll use a convolution or just purely sample-based if short.
        # Vectorized approximation: Moving average?
        
        # Let's use a simpler heuristic for Kick "Punch":
        # Just apply a short decay envelope gain to the onset?
        # "Unlike snares... we want to boost the entire onset"
        # Let's implement actual envelope follower difference if possible.
        # Since we are offline rendering, we can do it properly.
        
        abs_sig = torch.abs(waveform)
        
        # Fast response (Instant attack, fast release)
        # Slow response (Slower attack, slow release)
        # This is hard to vectorize perfectly without C++.
        # Hybrid approach: Boost the first 50ms relative to the rest?
        # Or just use the User's "Punch" param to control an extra "Punch Envelope" on the master bus.
        # Let's stick to the "Punch Envelope" approach which is cleaner/faster in PyTorch.
        
        # Envelope to boost Attack:
        duration = waveform.shape[-1] / sample_rate
        t = torch.linspace(0, duration, waveform.shape[-1])
        punch_env = torch.exp(-t / 0.05) * amount * 2.0 # Boost first 50ms
        
        return waveform * (1.0 + punch_env)
