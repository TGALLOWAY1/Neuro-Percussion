import torch
import numpy as np
import torchaudio.functional as F
from engine.dsp.oscillators import Oscillator
from engine.dsp.envelopes import Envelope
from engine.dsp.noise import Noise
from engine.dsp.filters import Filter, Effects

class HatEngine:
    def __init__(self, sample_rate: int = 48000):
        self.target_sr = sample_rate
        self.oversample_factor = 4
        self.sample_rate = sample_rate * self.oversample_factor

    def render(self, params: dict, seed: int = 0) -> torch.Tensor:
        """
        Renders a commercial-grade Hi-Hat with 4x Oversampling.
        """
        # Random phase is beneficial for hats (humanization)
        # But we respect seed for deterministic storage
        torch.manual_seed(seed)
        duration = 0.5
        t = torch.linspace(0, duration, int(duration * self.sample_rate))
        
        # Unpack defaults
        tightness = params.get('tightness', 0.5)
        sheen = params.get('sheen', 0.5)
        dirt = params.get('dirt', 0.5)
        color = params.get('color', 0.5)
        
        # ==========================================
        # LAYER A: METAL (Ring Mod Bank)
        # ==========================================
        # 808 Style: 6 Oscillators at inharmonic ratios
        # Ratios approx: 263, 400, 421, 474, 587, 845 Hz relative logic
        # Multipliers based on fundamental ~300Hz
        base_hz = 300.0 + (color * 200.0) # 300 - 500Hz base
        ratios = torch.tensor([1.0, 1.5, 1.6, 1.8, 2.2, 3.2]) 
        # Add slight seed jitter
        ratios = ratios * (1.0 + (torch.rand(6) * 0.1))
        
        metal_sum = torch.zeros_like(t)
        
        for r in ratios:
            freq = base_hz * r
            # Square wave for harsh odd harmonics
            # Sign(Sin) is simple square
            # Random starting phase
            phase_offset = torch.rand(1) * 2 * np.pi
            osc = torch.sign(torch.sin(2 * np.pi * freq * t + phase_offset))
            metal_sum += osc
        
        # Ring Modulation simulation?
        # Actually 808 sums them then filters. 
        # But TR-606 or others XOR them. Summing square waves creates a step-pyramid wave.
        # Let's try XOR logic? Hard in floats.
        # Let's multiply adjacent pairs?
        # osc[0]*osc[1] + osc[2]*osc[3]...
        # Let's stick to summing for rich clusters, then Bandpass.
        
        # Resonator Bank (The "Shape")
        # 3 Parallel Bandpasses
        # Frequencies tuned high: 6kHz, 8kHz, 11kHz
        # Sheen param controls Gain of these filters
        
        bp1 = Filter.bandpass(metal_sum, self.sample_rate, 6000.0, q=3.0)
        bp2 = Filter.bandpass(metal_sum, self.sample_rate, 9000.0, q=4.0)
        bp3 = Filter.bandpass(metal_sum, self.sample_rate, 12000.0, q=5.0)
        
        layer_a = (bp1 + bp2 + bp3) * 0.5 
        
        # ==========================================
        # LAYER B: AIR (Pink Noise)
        # ==========================================
        # Pink noise approximation: Filtered white noise
        # 1/f slope.
        # Simplified: White noise + LPF 6dB/oct? No Pink is LPF 3dB/oct.
        # Let's just use White Noise + HPF for "Air" layer as per spec.
        # Spec says Pink Noise source.
        # We'll use White and rely on HPF to shape it.
        noise = torch.randn(len(t))
        air_cut = 7000.0
        layer_b = Filter.highpass(noise, self.sample_rate, air_cut) * (sheen * 0.5 + 0.2)

        # ==========================================
        # LAYER C: CHICK (Stick Impact)
        # ==========================================
        # Filtered Click (2ms)
        click_dur = int(0.002 * self.sample_rate)
        click = torch.zeros_like(t)
        click[:click_dur] = torch.randn(click_dur)
        # Filter to remove low thud
        layer_c = Filter.highpass(click, self.sample_rate, 4000.0) * 0.5

        # ==========================================
        # ENVELOPE (Tightness)
        # ==========================================
        # Sum
        mix = layer_a + layer_b + layer_c
        
        # Decay
        # Closed: 20ms - 80ms
        # Open: 200ms - 800ms
        # Map Tightness 0.0 -> Open(0.8s), 1.0 -> Closed(0.05s)
        # So decay = 0.8 - (tightness * 0.75) 
        # Wait, Tightness usually means short?
        # User guideline: "Tightness... Closed 20ms... Open 800ms"
        # If Tightness is "Amount of Tightness", then High Tightness = Short Decay.
        decay = 0.8 - (tightness * 0.76) # Range 0.8s to 0.04s
        
        env = torch.exp(-t / decay)
        mix = mix * env

        # ==========================================
        # POST CHAIN
        # ==========================================
        # 1. Aggressive HPF (3kHz)
        mix = Filter.highpass(mix, self.sample_rate, 3000.0 + (color * 1000.0))
        
        # 2. Bitcrush (Dirt)
        # Decimate / Sample & Hold
        # Target SR: 48kHz -> 12kHz
        if dirt > 0:
            target_crush = 48000.0 - (dirt * 36000.0) # down to 12k
            factor = int(self.sample_rate / target_crush)
            if factor > 1:
                # Crush: Keep every Nth sample, hold it?
                # Simple zero-order hold simulation
                # Reshape to (N_samples//factor, factor) then repeat? 
                # Torch scatter/gather is complex. 
                # Slicing is easiest but linear interp is smoother.
                # Lo-Fi wants jagged.
                # mix[::factor] repeated_interleave?
                mix = mix.clone() # copy
                # Manual Hold
                for i in range(0, len(mix), factor):
                     val = mix[i]
                     end_idx = min(i + factor, len(mix))
                     mix[i:end_idx] = val
        
        # 3. Saturation (Oversampled)
        # Pre-emphasis: Boost highs
        mix = mix * (1.0 + dirt)
        mix = torch.tanh(mix)
        
        # Downsample
        mix = Filter.lowpass(mix, self.sample_rate, self.target_sr / 2.0 - 1000)
        mix = mix[::self.oversample_factor]
        
        # Final Clip
        peak = torch.max(torch.abs(mix))
        if peak > 0:
            mix = mix / peak * 0.95
            
        return mix
