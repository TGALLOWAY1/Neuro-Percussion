import torch
import torch.fft

class Noise:
    @staticmethod
    def white(duration: float, sample_rate: int) -> torch.Tensor:
        """Generates white noise (Gaussian distribution)."""
        num_samples = int(duration * sample_rate)
        return torch.randn(num_samples)

    @staticmethod
    def pink(duration: float, sample_rate: int) -> torch.Tensor:
        """
        Generates pink noise (1/f) via spectral shaping.
        """
        num_samples = int(duration * sample_rate)
        # Generate white noise
        white = torch.randn(num_samples)
        
        # FFT
        X = torch.fft.rfft(white)
        
        # 1/f filter
        freqs = torch.fft.rfftfreq(num_samples, d=1/sample_rate)
        # Avoid division by zero at DC
        freqs[0] = 1.0 
        scale = 1.0 / torch.sqrt(freqs)
        scale[0] = 0.0 # Remove DC
        
        X_pink = X * scale
        
        # Inverse FFT
        pink = torch.fft.irfft(X_pink, n=num_samples)
        
        # Normalize
        pink = pink / (torch.max(torch.abs(pink)) + 1e-6)
        return pink
