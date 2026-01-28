import torch
import sys
import os

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from engine.instruments.snare import SnareEngine

def debug_snare():
    print("Debugging SnareEngine v2...")
    snare = SnareEngine(sample_rate=48000)
    
    # Mock params
    params = {'tone': 0.5, 'body': 0.5}
    
    # We want to access internal variables during render.
    # We'll monkey patch or just copy paste logic here to verify calculations.
    
    sample_rate = 96000 # 48k * 2
    tone = 0.5
    fund_freq = 150.0 + (tone * 150.0)
    print(f"Fundamental Freq: {fund_freq} Hz")
    
    detune_cents = torch.tensor([0.0, 5.0, -7.0, 12.0])
    pitch_mults = torch.pow(2.0, detune_cents / 1200.0)
    actual_freqs = fund_freq * pitch_mults
    print(f"Actual Freqs: {actual_freqs}")
    
    delay_lens = sample_rate / actual_freqs
    print(f"Delay Lengths (samples): {delay_lens}")
    print(f"Delay Lengths (ms): {delay_lens / sample_rate * 1000}")
    
    # Check block size impact
    block_size = 32 # Updated in snare.py
    min_delay = torch.min(delay_lens)
    print(f"Block Size: {block_size}")
    if min_delay < block_size:
        print(f"CRITICAL: Min delay ({min_delay:.2f}) < Block Size ({block_size}). Feedback will be broken/quantized!")
        
    # Check Gain
    body_amt = 0.5
    # feedback_gain = 0.98 + (body_amt * 0.019)
    # New formula:
    feedback_gain = 0.85 + (body_amt * 0.11) 
    print(f"Feedback Gain: {feedback_gain}")
    
    # Calc T60 for 300 samples (3ms)
    # g = 0.001 ^ (D / T60)
    # log(g) = D/T60 * -3
    # T60 = D * -3 / log(g)
    import math
    avg_delay_s = torch.mean(delay_lens) / sample_rate
    t60 = avg_delay_s * -3.0 / math.log10(feedback_gain) # Log10? No ln? 
    # Formula g = 10^(-3 * D / T60)
    # log10(g) = -3 * D / T60
    # T60 = -3 * D / log10(g)
    
    t60_val = -3.0 * avg_delay_s.item() / math.log10(feedback_gain)
    print(f"Estimated T60 Decay: {t60_val:.4f} seconds")

if __name__ == "__main__":
    debug_snare()
