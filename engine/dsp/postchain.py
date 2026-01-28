"""
Shared post-processing chain: DC block, fades, ceiling, optional transient.
Deterministic; no randomness. Per PRD: boundary fades, -0.8 dBFS ceiling, max(abs) <= 0.92.
"""
from typing import Optional

import torch

from engine.dsp.filters import Effects

# PRD: max true peak <= -0.8 dBFS; safety clamp
CEILING_DBFS = -0.8
CEILING_LIN = 10.0 ** (CEILING_DBFS / 20.0)  # ~0.912
SAFETY_CLAMP = 0.92

# Boundary fades (PRD)
FADE_IN_MS = 0.5
FADE_OUT_MS = 2.0


class PostChain:
    """
    Shared post chain: DC block -> optional transient -> soft clip -> fades -> safety clamp.
    All steps are deterministic.
    """

    @staticmethod
    def _dc_block(buffer: torch.Tensor) -> torch.Tensor:
        """Remove DC (mean). Deterministic."""
        return buffer - buffer.mean()

    @staticmethod
    def _boundary_fades(buffer: torch.Tensor, sample_rate: int) -> torch.Tensor:
        """Apply 0.5 ms fade-in, 2 ms fade-out. Linear ramps."""
        n = buffer.shape[-1]
        if n == 0:
            return buffer
        out = buffer.clone()
        n_in = max(1, int(FADE_IN_MS * 1e-3 * sample_rate))
        n_out = max(1, int(FADE_OUT_MS * 1e-3 * sample_rate))
        n_in = min(n_in, n)
        n_out = min(n_out, n)
        if n_in > 0:
            ramp_in = torch.linspace(0.0, 1.0, n_in, device=buffer.device, dtype=buffer.dtype)
            out[..., :n_in] = out[..., :n_in] * ramp_in
        if n_out > 0 and n_out < n:
            ramp_out = torch.linspace(1.0, 0.0, n_out, device=buffer.device, dtype=buffer.dtype)
            out[..., -n_out:] = out[..., -n_out:] * ramp_out
        elif n_out >= n:
            ramp_out = torch.linspace(1.0, 0.0, n, device=buffer.device, dtype=buffer.dtype)
            out = out * ramp_out
        return out

    @staticmethod
    def _soft_clip_ceiling(buffer: torch.Tensor) -> torch.Tensor:
        """Soft clip to -0.8 dBFS ceiling (per PRD)."""
        return Effects.soft_clip(buffer, threshold_db=CEILING_DBFS)

    @staticmethod
    def _safety_clamp(buffer: torch.Tensor) -> torch.Tensor:
        """Ensure max(abs(x)) <= 0.92."""
        return torch.clamp(buffer, -SAFETY_CLAMP, SAFETY_CLAMP)

    @classmethod
    def process(
        cls,
        buffer: torch.Tensor,
        instrument_name: str,
        sample_rate: int,
        params: Optional[dict] = None,
    ) -> torch.Tensor:
        """
        Run full post chain on buffer. Deterministic.
        Order: DC block -> optional transient_shaper -> soft clip -> fades -> safety clamp.
        """
        params = params or {}
        x = buffer.view(-1) if buffer.dim() > 1 else buffer
        x = x.float()

        # 1. DC block
        x = cls._dc_block(x)

        # 2. Optional transient shaper (uses existing Effects.transient_shaper)
        amount = params.get("transient_shaper", 0.0)
        try:
            amount = float(amount)
        except (TypeError, ValueError):
            amount = 0.0
        if amount > 0:
            x = Effects.transient_shaper(x, sample_rate, amount)

        # 3. Soft clip at -0.8 dBFS
        x = cls._soft_clip_ceiling(x)

        # 4. Boundary fades (0.5 ms in, 2 ms out)
        x = cls._boundary_fades(x, sample_rate)

        # 5. Safety clamp to ±0.92
        x = cls._safety_clamp(x)

        return x
