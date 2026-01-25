import torch
import numpy as np

class FeatureExtractor:
    def __init__(self, sample_rate: int = 48000):
        self.sample_rate = sample_rate

    def compute(self, waveform: torch.Tensor) -> dict:
        """
        Computes audio features for the given waveform.
        """
        if waveform.dim() > 1:
            waveform = waveform.squeeze()
            
        # Ensure we work with normalized audio for some metrics
        # But for features absolute values matter sometimes. 
        # Standardize for ML input:
        
        # 1. RMS (Root Mean Square)
        rms = torch.sqrt(torch.mean(waveform ** 2)).item()
        
        # 2. Crest Factor (Peak / RMS) in dB
        peak = torch.max(torch.abs(waveform)).item()
        crest_factor = 20 * np.log10(peak / (rms + 1e-9) + 1e-9)
        
        # 3. Spectral Features
        # FFT
        n_fft = 2048
        hop_length = 512
        window = torch.hann_window(n_fft)
        stft = torch.stft(waveform.view(1, -1), n_fft=n_fft, hop_length=hop_length, window=window, return_complex=True)
        magnitudes = torch.abs(stft).squeeze() # [n_bins, n_frames]
        
        # Average Spectrum
        avg_mag = torch.mean(magnitudes, dim=1) # [n_bins]
        
        # Frequencies
        freqs = torch.linspace(0, self.sample_rate / 2, avg_mag.shape[0])
        
        # Spectral Centroid
        # Sum(mag * freq) / Sum(mag)
        sum_mag = torch.sum(avg_mag).item()
        centroid = 0.0
        if sum_mag > 0:
            centroid = torch.sum(avg_mag * freqs).item() / sum_mag
            
        # Spectral Flatness (Wiener Entropy)
        # GeometricMean(mag) / ArithmeticMean(mag)
        # calculated per frame then averaged, or on avg spectrum?
        # Usually per frame.
        geom_mean = torch.exp(torch.mean(torch.log(magnitudes + 1e-9), dim=0))
        arith_mean = torch.mean(magnitudes, dim=0)
        flatness = torch.mean(geom_mean / (arith_mean + 1e-9)).item()
        
        return {
            "rms": rms,
            "crest_factor_db": crest_factor,
            "spectral_centroid": centroid,
            "spectral_flatness": flatness
        }
