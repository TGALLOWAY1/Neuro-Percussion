"""
Oversampling wrapper for distortion/saturation stages.
Prevents aliasing by upsampling -> processing -> anti-alias filter -> downsampling.
"""

import torch
from engine.dsp.filters import Filter


def oversample_distortion(
    signal: torch.Tensor,
    sample_rate: int,
    factor: int,
    process_fn,
    *args,
    **kwargs
) -> torch.Tensor:
    """
    Apply distortion with oversampling to prevent aliasing.
    
    Args:
        signal: Input signal at original sample rate
        sample_rate: Original sample rate
        factor: Oversampling factor (2 or 4)
        process_fn: Function that applies distortion: (signal, oversampled_rate, *args, **kwargs) -> signal
        *args, **kwargs: Additional arguments passed to process_fn
    
    Returns:
        Processed signal at original sample rate (anti-aliased)
    """
    if factor <= 1:
        # No oversampling: process directly
        return process_fn(signal, sample_rate, *args, **kwargs)
    
    # Upsample: repeat samples (zero-order hold)
    # For factor=4: [a, b, c] -> [a, a, a, a, b, b, b, b, c, c, c, c]
    oversampled_sr = sample_rate * factor
    n_orig = signal.shape[-1]
    n_oversampled = n_orig * factor
    
    # Simple zero-order hold upsampling
    signal_upsampled = signal.repeat_interleave(factor)
    
    # Process at oversampled rate
    signal_processed = process_fn(signal_upsampled, oversampled_sr, *args, **kwargs)
    
    # Anti-alias filter before downsampling (cutoff at Nyquist of original rate)
    nyquist_orig = sample_rate / 2.0
    # Use slightly below Nyquist to avoid artifacts
    cutoff = nyquist_orig * 0.95
    signal_filtered = Filter.lowpass(signal_processed, oversampled_sr, cutoff, q=0.707)
    
    # Downsample: take every Nth sample
    signal_downsampled = signal_filtered[::factor]
    
    # Trim to original length (in case of rounding)
    if signal_downsampled.shape[-1] > n_orig:
        signal_downsampled = signal_downsampled[:n_orig]
    elif signal_downsampled.shape[-1] < n_orig:
        signal_downsampled = torch.nn.functional.pad(signal_downsampled, (0, n_orig - signal_downsampled.shape[-1]))
    
    return signal_downsampled


def apply_tanh_distortion(
    signal: torch.Tensor,
    sample_rate: int,
    drive: float,
    oversample_factor: int = 4
) -> torch.Tensor:
    """
    Apply tanh saturation with oversampling to prevent aliasing.
    
    Args:
        signal: Input signal
        sample_rate: Sample rate (if already oversampled, use factor=1)
        drive: Drive amount (1.0 = no distortion, >1.0 = saturation)
        oversample_factor: Oversampling factor (default 4x, use 1 if already oversampled)
    
    Returns:
        Distorted signal at original sample rate (anti-aliased if oversampled)
    """
    def _tanh_process(sig: torch.Tensor, sr: int, dr: float) -> torch.Tensor:
        return torch.tanh(sig * dr)
    
    if oversample_factor <= 1:
        # No additional oversampling: process directly (signal may already be oversampled)
        return _tanh_process(signal, sample_rate, drive)
    
    return oversample_distortion(signal, sample_rate, oversample_factor, _tanh_process, drive)


def apply_wavefold_distortion(
    signal: torch.Tensor,
    sample_rate: int,
    drive: float,
    oversample_factor: int = 4
) -> torch.Tensor:
    """
    Apply wavefolding with oversampling.
    
    Args:
        signal: Input signal
        sample_rate: Sample rate
        drive: Drive amount
        oversample_factor: Oversampling factor (default 4x)
    
    Returns:
        Distorted signal at original sample rate
    """
    def _wavefold_process(sig: torch.Tensor, sr: int, dr: float) -> torch.Tensor:
        # Wavefold: mirror signal when it exceeds ±1
        driven = sig * dr
        # Simple wavefold: use abs and sign, fold back
        folded = torch.abs(driven) % 2.0
        folded = torch.where(folded > 1.0, 2.0 - folded, folded)
        return folded * torch.sign(driven)
    
    return oversample_distortion(signal, sample_rate, oversample_factor, _wavefold_process, drive)
