import torch
import numpy as np
import torchaudio.functional as F
from engine.dsp.oscillators import Oscillator
from engine.dsp.envelopes import Envelope
from engine.dsp.noise import Noise
from engine.dsp.filters import Filter, Effects

class SnareEngine:
    def __init__(self, sample_rate: int = 48000):
        self.target_sr = sample_rate
        self.oversample_factor = 4
        self.sample_rate = sample_rate * self.oversample_factor

    def render(self, params: dict, seed: int = 0) -> torch.Tensor:
        """
        Renders a commercial-grade Snare drum with 4x Oversampling.
        """
        torch.manual_seed(seed)
        duration = 0.5
        t = torch.linspace(0, duration, int(duration * self.sample_rate))
        
        # Unpack defaults
        tone = params.get('tone', 0.5)
        wire_amt = params.get('wire', 0.5)
        crack_amt = params.get('crack', 0.5)
        body_amt = params.get('body', 0.5)
        
        # ==========================================
        # LAYER A: MODAL SHELL (Body)
        # ==========================================
        # Fundamental Freq
        fund_freq = 180.0 + (tone * 120.0) # 180Hz - 300Hz
        
        # Ratios (Seed based randomization for character)
        # Base ratios for a drum: 1.0, 2.3, 3.6, 4.7
        base_ratios = torch.tensor([1.0, 2.3, 3.6, 4.7])
        # Add seed jitter (+/- 10%)
        jitter = (torch.rand(4) * 0.2) + 0.9 
        jitter[0] = 1.0 # Keep fundamental locked
        ratios = base_ratios * jitter
        
        # Amplitudes (Decay with freq)
        amps = torch.tensor([1.0, 0.4, 0.25, 0.15])
        
        # Decay (Frequencies decay faster)
        # "Body" param controls main decay
        main_decay = 0.1 + (body_amt * 0.15) # 100ms - 250ms
        decays = main_decay / (ratios ** 0.5)
        
        layer_a = torch.zeros_like(t)
        for i in range(4):
            freq = fund_freq * ratios[i]
            # Simple Sine (Damped)
            # sin(2*pi*f*t) * exp(-t/decay)
            osc = torch.sin(2 * np.pi * freq * t)
            env = torch.exp(-t / float(decays[i]))
            layer_a += osc * env * amps[i]
            
        layer_a = layer_a * body_amt

        # ==========================================
        # LAYER B: WIRES (Shaped Noise)
        # ==========================================
        noise = torch.randn(len(t))
        
        # Dynamic Bandpass Sweep
        # Start High (5kHz) -> Drop to Low (1kHz)
        # This simulates the initial "splash" of wires settling down
        start_cut = 5000.0
        end_cut = 1000.0
        # Sweep envelope
        sweep_env = torch.exp(-t / 0.05) 
        cutoff = end_cut + (start_cut - end_cut) * sweep_env
        
        # We need a time-varying filter. Biquad usually constant in Torch (unless we loop).
        # Efficient Approx: Parallel filters? Or just Crossfade two bandpasses?
        # Crossfade is cheaper.
        bp_high = Filter.bandpass(noise, self.sample_rate, 5000.0, q=0.7)
        bp_low = Filter.bandpass(noise, self.sample_rate, 1000.0, q=1.0)
        
        # Crossfade based on sweep_env
        wires_filtered = bp_high * sweep_env + bp_low * (1.0 - sweep_env)
        
        # Amp Envelope
        wire_decay = 0.15 + (wire_amt * 0.25)
        wire_amp_env = torch.exp(-t / wire_decay)
        
        layer_b = wires_filtered * wire_amp_env * wire_amt

        # ==========================================
        # LAYER C: CRACK (Transient)
        # ==========================================
        # Component 1: HPF Noise Burst
        noise_burst = torch.randn(len(t))
        burst_env = torch.exp(-t / 0.005) # 5ms
        noise_burst = Filter.highpass(noise_burst * burst_env, self.sample_rate, 2000.0)
        
        # Component 2: Impulse
        impulse = torch.zeros_like(t)
        impulse[0] = 1.0
        
        layer_c = (noise_burst + impulse) * crack_amt

        # ==========================================
        # SUM & POST
        # ==========================================
        mix = layer_a + layer_b + layer_c
        
        # 1. Cleanup HPF (100Hz) - Remove mud
        mix = Filter.highpass(mix, self.sample_rate, 100.0, q=0.707)
        
        # 2. Transient Shaper
        # Focus on Highs? We apply full band for now.
        if crack_amt > 0:
            mix = Effects.transient_shaper(mix, self.sample_rate, amount=crack_amt * 0.5)
        
        # 3. Saturation (Oversampled)
        # Soft Clip
        drive = 1.0 + (crack_amt * 2.0)
        mix = torch.tanh(mix * drive)
        
        # Downsample
        mix = Filter.lowpass(mix, self.sample_rate, self.target_sr / 2.0 - 1000)
        mix = mix[::self.oversample_factor]
        
        # Final Clip
        peak = torch.max(torch.abs(mix))
        if peak > 0:
            mix = mix / peak * 0.95
            
        return mix
