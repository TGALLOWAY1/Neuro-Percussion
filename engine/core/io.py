import soundfile as sf
import torch
import numpy as np
import io

class AudioIO:
    @staticmethod
    def save_wav(waveform: torch.Tensor, sample_rate: int, path: str, normalize: bool = False):
        """Saves a tensor to a WAV file."""
        # Convert to numpy
        if isinstance(waveform, torch.Tensor):
            data = waveform.detach().cpu().numpy()
        else:
            data = waveform
            
        # Normalize
        if normalize:
            peak = np.max(np.abs(data))
            if peak > 0:
                data = data / peak
                
        # Clamp to avoid wrap-around clipping
        data = np.clip(data, -1.0, 1.0)
        
        sf.write(path, data, sample_rate)

    @staticmethod
    def to_bytes(waveform: torch.Tensor, sample_rate: int, format: str = 'WAV') -> bytes:
        """Returns audio file as bytes (for API responses)."""
        buffer = io.BytesIO()
        
        # Convert to numpy
        if isinstance(waveform, torch.Tensor):
            data = waveform.detach().cpu().numpy()
        else:
            data = waveform
            
        # Clamp
        data = np.clip(data, -1.0, 1.0)
            
        sf.write(buffer, data, sample_rate, format=format)
        return buffer.getvalue()
