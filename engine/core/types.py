from dataclasses import dataclass, field
import numpy as np
import uuid
from typing import Dict, Any, Optional

@dataclass
class AudioBuffer:
    samples: np.ndarray  # float32 array
    sample_rate: int
    peak_dbfs: float = 0.0

@dataclass
class RenderContext:
    instrument: str  # "kick", "snare", "hat"
    style: str       # "clean", "gritty", "aggro", "airy"
    quality: str     # "draft", "high"
    
@dataclass
class Candidate:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    seed: int = 0
    dsp_params: Dict[str, Any] = field(default_factory=dict)
    context: Optional[RenderContext] = None
