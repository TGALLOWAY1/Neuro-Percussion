import torch
import numpy as np

class DelayLine:
    def __init__(self, max_delay_samples: int, device: torch.device = None):
        if device is None:
            device = torch.device('cpu')
        
        # Power of 2 buffer size for cheaper wrapping (optional, but good practice)
        # For simplicity, just use max_delay_samples + headroom
        self.buffer_size = int(max_delay_samples) + 4096 
        self.buffer = torch.zeros(self.buffer_size, device=device)
        self.write_ptr = 0
        self.device = device

    def reset(self):
        self.buffer.zero_()
        self.write_ptr = 0

    def write_block(self, input_block: torch.Tensor):
        """
        Write a block of samples to the delay line.
        Updates write_ptr.
        """
        block_len = input_block.shape[-1]
        
        # Handle wrap-around writing
        end_ptr = self.write_ptr + block_len
        
        if end_ptr <= self.buffer_size:
            self.buffer[self.write_ptr:end_ptr] = input_block
        else:
            # Split write
            first_chunk = self.buffer_size - self.write_ptr
            self.buffer[self.write_ptr:] = input_block[:first_chunk]
            self.buffer[:end_ptr - self.buffer_size] = input_block[first_chunk:]
            
        self.write_ptr = (self.write_ptr + block_len) % self.buffer_size

    def read_block(self, delay_samples: float, count: int) -> torch.Tensor:
        """
        Read a block of `count` samples from the past.
        Uses linear interpolation for fractional delay.
        
        Note: delay_samples is assumed constant for the whole block for now,
        or we could support a tensor of delay values if per-sample modulation is needed.
        User req: "Ensure detuning is changing with pitch".
        If pitch is static per block, float is fine.
        """
        # Calculate read pointers
        # read_ptr = write_ptr - delay_samples + i (where i is 0..count-1)
        # We need to construct a range of indices
        
        # Current write_ptr is where the N-th sample WOULD be written (or just finished writing N-1?)
        # Let's say write_ptr points to the NEXT empty slot.
        # So the "current time" t is conceptually at write_ptr.
        # We want to read from t - delay -> (write_ptr + i) - delay
        # But wait, we enter this function usually BEFORE writing the new block?
        # Or simultaneous?
        
        # Standard flow:
        # 1. Read from Delay(t)
        # 2. Process
        # 3. Write Result(t)
        # So we read relative to the CURRENT write_ptr.
        
        grid = torch.arange(count, device=self.device)
        read_centers = (self.write_ptr + grid) - delay_samples
        
        # Linear Interpolation
        # y = x[floor] * (1-frac) + x[ceil] * frac
        
        indices_floor = torch.floor(read_centers).long()
        indices_ceil = indices_floor + 1
        frac = read_centers - indices_floor
        
        # Wrap indices
        indices_floor = indices_floor % self.buffer_size
        indices_ceil = indices_ceil % self.buffer_size
        
        sample_floor = self.buffer[indices_floor]
        sample_ceil = self.buffer[indices_ceil]
        
        return sample_floor * (1.0 - frac) + sample_ceil * frac
