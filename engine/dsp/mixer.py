"""
Per-layer mix with gain (dB) and mute.
Uses param keys like "{instrument}.{layer}.gain_db" and "{instrument}.{layer}.mute".
"""
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

import torch

from engine.core.params import get_param, get_db_gain


# -----------------------------------------------------------------------------
# Layer spec (defaults when param missing)
# -----------------------------------------------------------------------------

@dataclass
class LayerSpec:
    """Default gain and mute for a layer when params do not specify them."""
    name: str
    gain_db: float = 0.0
    mute: bool = False


# -----------------------------------------------------------------------------
# Layer mixer
# -----------------------------------------------------------------------------

class LayerMixer:
    """
    Mix multiple layers with per-layer gain (dB) and mute from params.
    Keys: "{instrument}.{layer_name}.gain_db", "{instrument}.{layer_name}.mute".
    """

    def __init__(self):
        self._layers: Dict[str, torch.Tensor] = {}

    def add(self, name: str, audio: torch.Tensor, spec: Optional[LayerSpec] = None) -> None:
        """Register a layer. Same name overwrites. spec provides default gain_db/mute when param missing."""
        self._layers[name] = audio

    def mix(
        self,
        params: dict,
        instrument: str,
        default_specs: Optional[Dict[str, LayerSpec]] = None,
    ) -> Tuple[torch.Tensor, Dict[str, torch.Tensor]]:
        """
        Sum all layers after applying gain and mute from params.
        Returns (master_tensor, stems_dict). stems_dict is non-empty only when params["debug_stems"] is true.
        """
        default_specs = default_specs or {}
        stems: Dict[str, torch.Tensor] = {}
        debug_stems = bool(get_param(params, "debug_stems", False))

        if not self._layers:
            return torch.tensor([], dtype=torch.float32), stems

        ref_len = max(r.shape[-1] for r in self._layers.values())
        master = None

        for name, raw in self._layers.items():
            spec = default_specs.get(name)
            default_db = spec.gain_db if spec is not None else 0.0
            default_mute = spec.mute if spec is not None else False

            gain_key = f"{instrument}.{name}.gain_db"
            mute_key = f"{instrument}.{name}.mute"
            gain_lin = get_db_gain(params, gain_key, default_db)
            mute = get_param(params, mute_key, default_mute)

            layer = raw.view(-1) if raw.dim() >= 1 else raw
            length = layer.shape[-1]
            if length < ref_len:
                layer = torch.nn.functional.pad(layer, (0, ref_len - length))
            elif length > ref_len:
                layer = layer[..., :ref_len].clone()

            if mute:
                contribution = torch.zeros_like(layer)
            else:
                contribution = layer * gain_lin

            if master is None:
                master = contribution.clone()
            else:
                master = master + contribution

            if debug_stems:
                stems[name] = contribution.clone()

        return master, stems
