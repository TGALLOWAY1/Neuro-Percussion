import torch
import torchaudio.functional as F
import numpy as np
from engine.dsp.oscillators import Oscillator
from engine.dsp.envelopes import Envelope
from engine.dsp.noise import Noise
from engine.dsp.filters import Filter, Effects

class KickEngine:
    def __init__(self, sample_rate: int = 48000):
        self.target_sr = sample_rate
        self.oversample_factor = 4
        self.sample_rate = sample_rate * self.oversample_factor

    def render(self, params: dict, seed: int = 0) -> torch.Tensor:
        """
        Renders a commercial-grade Kick drum with 4x Oversampling.
        """
        torch.manual_seed(seed)
        duration = 0.5
        # Generate at 192kHz
        t = torch.linspace(0, duration, int(duration * self.sample_rate))
        
        # Unpack
        drop = params.get('drop', 0.5)
        knock = params.get('knock', 0.3)
        punch = params.get('punch', 0.5) 
        weight = params.get('weight', 0.5)
        tune = params.get('tune', 45.0)

        # ==========================================
        # LAYER A: THE SUB (FM Enhanced)
        # ==========================================
        # Pitch Env: Aggressive "Laser" -> "Thud" shape
        start_freq = 150.0 + (drop * 400.0) # Higher start for more "clicky" pitch drop
        end_freq = tune
        
        # Sharper curve for modern genres
        # Time constant decreases as 'Drop' increases (faster zap)
        decay_tau = 0.08 * (1.1 - drop * 0.8) 
        freq_env = end_freq + (start_freq - end_freq) * torch.exp(-t / decay_tau)
        
        phase = torch.cumsum(freq_env / self.sample_rate, dim=0) * 2 * np.pi
        
        # FM Logic: 
        # Modulator: Sine at same freq ratio (1:1) or fixed?
        # Feedback FM (Self-Osc) helps create "Square-like" but harmonically rich tones without aliasing hard edges
        # Mod Amount driven by envelope (more harmonics at start)
        fm_amt = 0.5 + (punch * 0.5) # More punch = more FM brightness
        mod_env = torch.exp(-t / 0.1) * fm_amt
        
        # Simple Phase Distortion / Self-FM
        # sin(phase + mod * sin(phase))
        sub_osc = torch.sin(phase + mod_env * torch.sin(phase))
        
        # Blend in some Triangle for body if Weight is high
        if weight > 0.5:
             # Basic Tri approx
             tri = 2.0 / np.pi * torch.asin(torch.sin(phase))
             blend = (weight - 0.5) * 2.0
             sub_osc = (1.0 - blend) * sub_osc + blend * tri

        amp_decay = 0.2 + (weight * 0.6)
        sub_env = torch.exp(-t / amp_decay)
        layer_a = sub_osc * sub_env

        # ==========================================
        # LAYER B: THE KNOCK (Tonal Transient)
        # ==========================================
        # Instead of filtered noise, let's use a short "Impulse Chirp" or fast decaying square
        # Dubstep kicks often have a "tock" sound.
        knock_hz = 120.0 + (knock * 100.0)
        # Short Sine Burst at fixed freq
        knock_osc = torch.sin(2 * np.pi * knock_hz * t)
        knock_env = torch.exp(-t / 0.04) # 40ms tight
        # Distort the knock to make it "Woody"
        knock_layer = torch.tanh(knock_osc * 3.0) * knock_env
        layer_b = knock_layer * knock * 1.5

        # ==========================================
        # LAYER C: THE CLICK (Top End)
        # ==========================================
        # HPF Noise
        noise = torch.randn(len(t))
        click_env = torch.exp(-t / 0.01) # 10ms
        layer_c = Filter.highpass(noise * click_env, self.sample_rate, 3000.0) * punch

        # ==========================================
        # SUM & POST
        # ==========================================
        mix = layer_a + layer_b + layer_c
        
        # Saturation (Oversampled)
        # Asymmetric soft clip for even harmonics (warmer/thicker)
        # f(x) = tanh(x) + 0.1 * x^2 ? 
        drive = 1.0 + (punch * 3.0)
        mix = torch.tanh(mix * drive)
        
        # Downsample
        # Simple Decimation for now (take every Nth sample)
        # Proper way: Lowpass then Decimate.
        # Apply anti-aliasing filter before decimation
        mix = Filter.lowpass(mix, self.sample_rate, self.target_sr / 2.0 - 1000)
        mix = mix[::self.oversample_factor]
        
        # Final Safety Clip
        peak = torch.max(torch.abs(mix))
        if peak > 0:
            mix = mix / peak * 0.95
            
        return mix
