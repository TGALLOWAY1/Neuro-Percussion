"""
Quality Control analysis for rendered one-shots.
Detects common failure modes: clipping, aliasing, ringing, spectral issues.
"""
import torch
import numpy as np
from typing import Dict, Optional

from engine.qc.thresholds import QC_THRESHOLDS


def _db(x: float) -> float:
    """Convert linear to dB."""
    if x <= 0:
        return -np.inf
    return 20.0 * np.log10(abs(x))


def _dbfs(x: float) -> float:
    """Convert linear amplitude to dBFS (full scale)."""
    return _db(x)


def _band_energy(audio: torch.Tensor, sample_rate: int, low_hz: float, high_hz: float) -> float:
    """Compute energy in frequency band using FFT magnitude."""
    n = len(audio)
    if n < 2:
        return 0.0
    
    n_fft = 2 ** int(np.ceil(np.log2(n)))
    fft = torch.fft.rfft(audio, n=n_fft)
    magnitude = torch.abs(fft)
    
    freqs = torch.fft.rfftfreq(n_fft, 1.0 / sample_rate)
    
    # Energy in band
    mask = (freqs >= low_hz) & (freqs <= high_hz)
    energy = torch.sum(magnitude[mask] ** 2)
    
    return float(energy)


def _band_energy_ratio(audio: torch.Tensor, sample_rate: int, 
                       band_low: float, band_high: float,
                       ref_low: float, ref_high: float) -> float:
    """Compute energy ratio: band / reference_band."""
    band_energy = _band_energy(audio, sample_rate, band_low, band_high)
    ref_energy = _band_energy(audio, sample_rate, ref_low, ref_high)
    
    if ref_energy < 1e-12:
        return 0.0
    
    return float(band_energy / ref_energy)


def _aliasing_proxy(audio: torch.Tensor, sample_rate: int) -> float:
    """
    Detect likely aliasing: excess energy above 12kHz relative to 5-10kHz.
    Returns ratio (higher = more aliasing).
    """
    energy_high = _band_energy(audio, sample_rate, 12000.0, sample_rate / 2.0)
    energy_mid = _band_energy(audio, sample_rate, 5000.0, 10000.0)
    
    if energy_mid < 1e-12:
        return 0.0
    
    return float(energy_high / energy_mid)


def _ringing_proxy(audio: torch.Tensor, sample_rate: int) -> float:
    """
    Detect narrowband ringing: high-Q peak in 400-2000Hz that persists in tail.
    Simple approach: find max narrowband energy in tail (last 50% of audio) vs attack (first 10%).
    """
    n = len(audio)
    if n < 100:
        return 0.0
    
    attack_end = n // 10
    tail_start = n // 2
    
    # Analyze tail for narrowband peaks
    tail = audio[tail_start:]
    attack = audio[:attack_end]
    
    # Use multiple narrow bands in 400-2000Hz
    bands = [(400, 500), (500, 700), (700, 1000), (1000, 1500), (1500, 2000)]
    
    max_tail_ratio = 0.0
    for low_hz, high_hz in bands:
        tail_energy = _band_energy(tail, sample_rate, low_hz, high_hz)
        attack_energy = _band_energy(attack, sample_rate, low_hz, high_hz)
        
        if attack_energy < 1e-12:
            continue
        
        ratio = float(tail_energy / attack_energy)
        max_tail_ratio = max(max_tail_ratio, ratio)
    
    return max_tail_ratio


def analyze(audio: torch.Tensor, sample_rate: int, instrument: str) -> Dict:
    """
    Analyze rendered one-shot for QC issues.
    
    Args:
        audio: Audio tensor (1D)
        sample_rate: Sample rate in Hz
        instrument: Instrument name ("kick", "snare", "hat")
    
    Returns:
        Dict with metrics and pass/fail flags
    """
    audio = audio.view(-1).float()
    
    # Basic metrics
    peak = float(torch.max(torch.abs(audio)))
    peak_dbfs = _dbfs(peak)
    
    rms = float(torch.sqrt(torch.mean(audio ** 2) + 1e-12))
    rms_dbfs = _dbfs(rms)
    
    crest_factor = peak / (rms + 1e-12)
    
    # Spectral band analysis (instrument-specific)
    metrics = {
        "peak_dbfs": peak_dbfs,
        "rms_dbfs": rms_dbfs,
        "crest_factor": crest_factor,
        "peak_linear": peak,
        "rms_linear": rms,
    }
    
    if instrument == "snare":
        # Snare-specific bands
        body_energy = _band_energy(audio, sample_rate, 150.0, 250.0)
        boxiness_energy = _band_energy(audio, sample_rate, 300.0, 600.0)
        crack_energy = _band_energy(audio, sample_rate, 5000.0, 8000.0)
        total_energy = _band_energy(audio, sample_rate, 20.0, sample_rate / 2.0)
        
        if total_energy > 1e-12:
            metrics["body_ratio"] = float(body_energy / total_energy)
            metrics["boxiness_ratio"] = float(boxiness_energy / total_energy)
            metrics["crack_ratio"] = float(crack_energy / total_energy)
        else:
            metrics["body_ratio"] = 0.0
            metrics["boxiness_ratio"] = 0.0
            metrics["crack_ratio"] = 0.0
        
        # Aliasing and ringing
        metrics["aliasing_proxy"] = _aliasing_proxy(audio, sample_rate)
        metrics["ringing_proxy"] = _ringing_proxy(audio, sample_rate)
        
    elif instrument == "hat":
        # Hat-specific bands
        low_energy = _band_energy(audio, sample_rate, 20.0, 3000.0)
        high_energy = _band_energy(audio, sample_rate, 3000.0, sample_rate / 2.0)
        total_energy = low_energy + high_energy
        
        if total_energy > 1e-12:
            metrics["low_ratio"] = float(low_energy / total_energy)
            metrics["high_ratio"] = float(high_energy / total_energy)
        else:
            metrics["low_ratio"] = 0.0
            metrics["high_ratio"] = 0.0
        
        # HPF check: energy below 3kHz should be minimal
        metrics["energy_below_3k_pct"] = metrics["low_ratio"] * 100.0
        
        # Aliasing check
        metrics["aliasing_proxy"] = _aliasing_proxy(audio, sample_rate)
        
    elif instrument == "kick":
        # Kick-specific: low-end energy, click presence
        sub_energy = _band_energy(audio, sample_rate, 20.0, 100.0)
        click_energy = _band_energy(audio, sample_rate, 2000.0, 8000.0)
        total_energy = _band_energy(audio, sample_rate, 20.0, sample_rate / 2.0)
        
        if total_energy > 1e-12:
            metrics["sub_ratio"] = float(sub_energy / total_energy)
            metrics["click_ratio"] = float(click_energy / total_energy)
        else:
            metrics["sub_ratio"] = 0.0
            metrics["click_ratio"] = 0.0
        
        # Aliasing check
        metrics["aliasing_proxy"] = _aliasing_proxy(audio, sample_rate)
    
    # Evaluate against thresholds
    thresholds = QC_THRESHOLDS.get(instrument, {})
    failures = []
    warnings = []
    
    # Peak check
    peak_min = thresholds.get("peak_dbfs_min", -1.0)
    peak_max = thresholds.get("peak_dbfs_max", -0.1)
    if peak_dbfs < peak_min:
        failures.append(f"Peak too low: {peak_dbfs:.2f} dBFS < {peak_min:.2f} dBFS")
    elif peak_dbfs > peak_max:
        failures.append(f"Peak too high (clipping risk): {peak_dbfs:.2f} dBFS > {peak_max:.2f} dBFS")
    
    # Instrument-specific checks
    if instrument == "snare":
        body_min = thresholds.get("body_ratio_min", 0.01)
        if metrics["body_ratio"] < body_min:
            failures.append(f"Body energy too low: {metrics['body_ratio']:.4f} < {body_min:.4f}")
        
        boxiness_max = thresholds.get("boxiness_ratio_max", 0.15)
        if metrics["boxiness_ratio"] > boxiness_max:
            warnings.append(f"Boxiness high: {metrics['boxiness_ratio']:.4f} > {boxiness_max:.4f}")
        
        crack_min = thresholds.get("crack_ratio_min", 0.01)
        if metrics["crack_ratio"] < crack_min:
            warnings.append(f"Crack energy low: {metrics['crack_ratio']:.4f} < {crack_min:.4f}")
        
        aliasing_max = thresholds.get("aliasing_proxy_max", 0.5)
        if metrics["aliasing_proxy"] > aliasing_max:
            warnings.append(f"Aliasing proxy high: {metrics['aliasing_proxy']:.4f} > {aliasing_max:.4f}")
        
        ringing_max = thresholds.get("ringing_proxy_max", 0.3)
        if metrics["ringing_proxy"] > ringing_max:
            warnings.append(f"Ringing detected: {metrics['ringing_proxy']:.4f} > {ringing_max:.4f}")
    
    elif instrument == "hat":
        low_max_pct = thresholds.get("energy_below_3k_max_pct", 10.0)
        if metrics["energy_below_3k_pct"] > low_max_pct:
            failures.append(f"Too much energy below 3kHz: {metrics['energy_below_3k_pct']:.1f}% > {low_max_pct:.1f}%")
        
        aliasing_max = thresholds.get("aliasing_proxy_max", 0.5)
        if metrics["aliasing_proxy"] > aliasing_max:
            warnings.append(f"Aliasing proxy high: {metrics['aliasing_proxy']:.4f} > {aliasing_max:.4f}")
    
    elif instrument == "kick":
        sub_min = thresholds.get("sub_ratio_min", 0.2)
        if metrics["sub_ratio"] < sub_min:
            warnings.append(f"Sub energy low: {metrics['sub_ratio']:.4f} < {sub_min:.4f}")
        
        aliasing_max = thresholds.get("aliasing_proxy_max", 0.5)
        if metrics["aliasing_proxy"] > aliasing_max:
            warnings.append(f"Aliasing proxy high: {metrics['aliasing_proxy']:.4f} > {aliasing_max:.4f}")
    
    # Overall status
    status = "PASS"
    if failures:
        status = "FAIL"
    elif warnings:
        status = "WARN"
    
    return {
        "instrument": instrument,
        "status": status,
        "metrics": metrics,
        "failures": failures,
        "warnings": warnings,
    }
