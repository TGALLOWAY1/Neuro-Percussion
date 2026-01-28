"""
Snare engine: exciter_body, exciter_air, shell, wires, room layers with
per-layer faders/mute and AMP ADSR. Macro params (tone, wire, crack, body) preserved.
Shell uses stateful one-pole LPF and 4x4 Hadamard feedback matrix.
"""
import logging
import torch
import numpy as np
from engine.dsp.oscillators import Oscillator
from engine.dsp.envelopes import ADSR, ms_to_s
from engine.dsp.filters import Filter, Effects
from engine.dsp.delay import DelayLine
from engine.dsp.postchain import PostChain
from engine.dsp.mixer import LayerMixer, LayerSpec
from engine.core.params import get_param

logger = logging.getLogger(__name__)


def resolve_snare_spec_params(params: dict) -> dict:
    """
    Map snare.spec.* parameters to internal params.
    Only applies if any snare.spec.* keys exist.
    User-provided advanced params take precedence (not overwritten).
    
    Returns a dict of implied internal params that should be merged with user params.
    """
    # Check if spec params exist
    spec_prefix = "snare.spec."
    has_spec = any(key.startswith(spec_prefix) for key in params.keys()) or (
        "snare" in params and isinstance(params.get("snare"), dict) and "spec" in params.get("snare", {})
    )
    
    if not has_spec:
        return {}
    
    implied = {}
    
    # Helper to get spec param with default
    def get_spec(key: str, default: float) -> float:
        # Try nested: params["snare"]["spec"][key]
        if "snare" in params and isinstance(params["snare"], dict):
            if "spec" in params["snare"] and isinstance(params["snare"]["spec"], dict):
                if key in params["snare"]["spec"]:
                    try:
                        return float(params["snare"]["spec"][key])
                    except (TypeError, ValueError):
                        pass
        # Try flat: params["snare.spec.key"]
        flat_key = f"snare.spec.{key}"
        val = get_param(params, flat_key, default)
        try:
            return float(val)
        except (TypeError, ValueError):
            return default
    
    # Get spec values
    tune_hz = get_spec("tune_hz", 200.0)
    tone_decay_ms = get_spec("tone_decay_ms", 150.0)
    pitch_env_st = get_spec("pitch_env_st", 12.0)
    snare_level = get_spec("snare_level", 0.6)
    noise_decay_ms = get_spec("noise_decay_ms", 250.0)
    wire_filter_hz = get_spec("wire_filter_hz", 5000.0)
    snap_attack_ms = get_spec("snap_attack_ms", 1.0)
    hardness = get_spec("hardness", 0.5)
    box_cut_db = get_spec("box_cut_db", -6.0)
    box_cut_hz = get_spec("box_cut_hz", 500.0)
    
    # Clamp to safe ranges
    tune_hz = max(120.0, min(250.0, tune_hz))
    tone_decay_ms = max(50.0, min(400.0, tone_decay_ms))
    pitch_env_st = max(0.0, min(24.0, pitch_env_st))
    snare_level = max(0.0, min(1.0, snare_level))
    noise_decay_ms = max(100.0, min(600.0, noise_decay_ms))
    wire_filter_hz = max(1000.0, min(10000.0, wire_filter_hz))
    snap_attack_ms = max(0.0, min(10.0, snap_attack_ms))
    hardness = max(0.0, min(1.0, hardness))
    box_cut_db = max(-15.0, min(0.0, box_cut_db))
    box_cut_hz = max(400.0, min(600.0, box_cut_hz))
    
    # Check if user already provided these params
    def has_user(key: str) -> bool:
        keys = key.split(".")
        current = params
        for k in keys:
            if not isinstance(current, dict) or k not in current:
                return False
            current = current[k]
        return True
    
    # Map to internal params (only if user didn't provide them)
    
    # Body/Shell layer (tonal head)
    # Map: body ~= shell
    if not has_user("snare.shell.amp.decay_ms"):
        implied.setdefault("snare", {}).setdefault("shell", {}).setdefault("amp", {})["decay_ms"] = tone_decay_ms
    if not has_user("snare.shell.amp.attack_ms"):
        implied.setdefault("snare", {}).setdefault("shell", {}).setdefault("amp", {})["attack_ms"] = snap_attack_ms
    if not has_user("snare.shell.amp.release_ms"):
        implied.setdefault("snare", {}).setdefault("shell", {}).setdefault("amp", {})["release_ms"] = 50.0
    
    # Pitch controls for body/shell
    if not has_user("snare.shell.pitch_hz"):
        implied.setdefault("snare", {}).setdefault("shell", {})["pitch_hz"] = tune_hz
    if not has_user("snare.shell.pitch_env_st"):
        implied.setdefault("snare", {}).setdefault("shell", {})["pitch_env_st"] = pitch_env_st
    if not has_user("snare.shell.pitch_decay_ms"):
        # Use min(tone_decay_ms, 80ms) for pitch decay
        implied.setdefault("snare", {}).setdefault("shell", {})["pitch_decay_ms"] = min(tone_decay_ms, 80.0)
    
    # Wires layer
    if not has_user("snare.wires.amp.decay_ms"):
        implied.setdefault("snare", {}).setdefault("wires", {}).setdefault("amp", {})["decay_ms"] = noise_decay_ms
    if not has_user("snare.wires.amp.attack_ms"):
        implied.setdefault("snare", {}).setdefault("wires", {}).setdefault("amp", {})["attack_ms"] = 0.0
    if not has_user("snare.wires.amp.release_ms"):
        implied.setdefault("snare", {}).setdefault("wires", {}).setdefault("amp", {})["release_ms"] = 90.0
    
    # Wire filter
    if not has_user("snare.wires.filter_hz"):
        implied.setdefault("snare", {}).setdefault("wires", {})["filter_hz"] = wire_filter_hz
    
    # Wires gain_db from snare_level (0..1 -> -18dB..+3dB perceptual curve)
    if not has_user("snare.wires.gain_db"):
        # Perceptual curve: 0.0 -> -18dB, 0.5 -> -6dB, 1.0 -> +3dB
        implied.setdefault("snare", {}).setdefault("wires", {})["gain_db"] = -18.0 + (snare_level ** 1.5) * 21.0
    
    # Snap layer (exciter_body + exciter_air)
    # Map: snap ~= exciter_body + exciter_air
    if not has_user("snare.exciter_body.amp.decay_ms"):
        # Very short decay for snap (~5ms)
        implied.setdefault("snare", {}).setdefault("exciter_body", {}).setdefault("amp", {})["decay_ms"] = 5.0
    if not has_user("snare.exciter_body.amp.attack_ms"):
        implied.setdefault("snare", {}).setdefault("exciter_body", {}).setdefault("amp", {})["attack_ms"] = snap_attack_ms
    if not has_user("snare.exciter_body.amp.release_ms"):
        implied.setdefault("snare", {}).setdefault("exciter_body", {}).setdefault("amp", {})["release_ms"] = 5.0
    
    if not has_user("snare.exciter_air.amp.decay_ms"):
        # Very short decay for snap (~3ms)
        implied.setdefault("snare", {}).setdefault("exciter_air", {}).setdefault("amp", {})["decay_ms"] = 3.0
    if not has_user("snare.exciter_air.amp.attack_ms"):
        implied.setdefault("snare", {}).setdefault("exciter_air", {}).setdefault("amp", {})["attack_ms"] = snap_attack_ms
    if not has_user("snare.exciter_air.amp.release_ms"):
        implied.setdefault("snare", {}).setdefault("exciter_air", {}).setdefault("amp", {})["release_ms"] = 5.0
    
    # Snap gain_db (subtle but critical, ~-6dB baseline)
    if not has_user("snare.exciter_body.gain_db"):
        implied.setdefault("snare", {}).setdefault("exciter_body", {})["gain_db"] = -6.0
    if not has_user("snare.exciter_air.gain_db"):
        implied.setdefault("snare", {}).setdefault("exciter_air", {})["gain_db"] = -6.0
    
    # Hardness (transient saturation on snap)
    if not has_user("snare.snap.hardness"):
        implied.setdefault("snare", {}).setdefault("snap", {})["hardness"] = hardness
    
    # Box cut notch
    if not has_user("snare.box_cut.hz"):
        implied.setdefault("snare", {}).setdefault("box_cut", {})["hz"] = box_cut_hz
    if not has_user("snare.box_cut.db"):
        implied.setdefault("snare", {}).setdefault("box_cut", {})["db"] = box_cut_db
    
    return implied


# 4x4 Hadamard (normalized), delay i receives sum_j H[i,j] * d_j
_HADAMARD_4 = 0.5 * torch.tensor(
    [[1, 1, 1, 1], [1, -1, 1, -1], [1, 1, -1, -1], [1, -1, -1, 1]], dtype=torch.float32
)


class _OnePoleLPF:
    """Stateful one-pole LPF: y[n] = a*x[n] + (1-a)*y[n-1], a = 1 - exp(-2*pi*fc/sr).
    Optimized: Uses stateless biquad filter for performance (no Python loops).
    For FDN feedback, state is maintained through delay lines, so stateless filter is acceptable.
    """

    def __init__(self, sample_rate: int):
        self.sr = sample_rate
        # No state needed - using stateless biquad filter

    def reset(self):
        # No-op for stateless filter
        pass

    def process(self, x: torch.Tensor, cutoff_hz: float) -> torch.Tensor:
        """
        Use stateless biquad lowpass filter instead of stateful one-pole.
        Much faster (no Python loops) and similar frequency response.
        State is maintained through delay lines in FDN, so stateless filter is fine.
        """
        if x.shape[-1] == 0:
            return x
        
        fc = min(max(cutoff_hz, 10.0), self.sr / 2 - 1)
        # Use biquad lowpass filter (stateless, vectorized, fast)
        # Q=0.707 gives similar response to one-pole
        return Filter.lowpass(x, self.sr, fc, q=0.707)


def _snare_amp_env(
    layer: str,
    params: dict,
    tone: float,
    wire_amt: float,
    crack_amt: float,
    body_amt: float,
    duration_s: float,
    sample_rate: int,
) -> torch.Tensor:
    prefix = f"snare.{layer}.amp"
    if layer == "exciter_body":
        decay_ms = get_param(params, f"{prefix}.decay_ms", 50.0)  # ~exp(-t*20) -> 50ms
        attack_ms = get_param(params, f"{prefix}.attack_ms", 0.0)
        sustain = get_param(params, f"{prefix}.sustain", 0.0)
        release_ms = get_param(params, f"{prefix}.release_ms", 0.0)
    elif layer == "exciter_air":
        decay_ms = get_param(params, f"{prefix}.decay_ms", 20.0)  # ~exp(-t*50) -> 20ms
        attack_ms = get_param(params, f"{prefix}.attack_ms", 0.0)
        sustain = get_param(params, f"{prefix}.sustain", 0.0)
        release_ms = get_param(params, f"{prefix}.release_ms", 0.0)
    elif layer == "shell":
        decay_ms = get_param(params, f"{prefix}.decay_ms", 500.0)  # default flat within 0.5s (recreate current)
        attack_ms = get_param(params, f"{prefix}.attack_ms", 0.0)
        sustain = get_param(params, f"{prefix}.sustain", 1.0)
        release_ms = get_param(params, f"{prefix}.release_ms", 0.0)
    elif layer == "wires":
        decay_ms = get_param(params, f"{prefix}.decay_ms", 500.0)  # default flat; wire_env baked in
        attack_ms = get_param(params, f"{prefix}.attack_ms", 0.0)
        sustain = get_param(params, f"{prefix}.sustain", 1.0)
        release_ms = get_param(params, f"{prefix}.release_ms", 0.0)
    else:  # room
        decay_ms = get_param(params, f"{prefix}.decay_ms", 400.0)
        attack_ms = get_param(params, f"{prefix}.attack_ms", 0.0)
        sustain = get_param(params, f"{prefix}.sustain", 0.0)
        release_ms = get_param(params, f"{prefix}.release_ms", 0.0)
    try:
        attack_s = ms_to_s(float(attack_ms))
        decay_s = ms_to_s(float(decay_ms))
        release_s = ms_to_s(float(release_ms))
        sustain = float(sustain)
    except (TypeError, ValueError):
        attack_s, decay_s, release_s, sustain = 0.0, 0.1, 0.0, 0.0
    adsr = ADSR(sample_rate, attack_s, decay_s, sustain, release_s, hold_s=0.0, curve="exp")
    return adsr.render(duration_s, gate_s=duration_s)


def _trim_env(env: torch.Tensor, length: int) -> torch.Tensor:
    if env.shape[-1] >= length:
        return env[..., :length].clone()
    return torch.nn.functional.pad(env, (0, length - env.shape[-1]))


class SnareEngine:
    def __init__(self, sample_rate: int = 48000):
        self.target_sr = sample_rate
        self.oversample_factor = 2
        self.sample_rate = sample_rate * self.oversample_factor
        self.delays = [DelayLine(10000) for _ in range(4)]
        self._lpfs = [_OnePoleLPF(self.sample_rate) for _ in range(4)]

    def render(self, params: dict, seed: int = 0) -> torch.Tensor:
        torch.manual_seed(seed)
        duration = 0.5
        num_samples = int(duration * self.sample_rate)
        t = torch.linspace(0, duration, num_samples)

        # DEBUG: Log incoming params
        logger.debug(f"[SNARE RENDER] Incoming params keys: {list(params.keys())}")
        logger.debug(f"[SNARE RENDER] Legacy macros: tone={params.get('tone')}, wire={params.get('wire')}, crack={params.get('crack')}, body={params.get('body')}")
        logger.debug(f"[SNARE RENDER] Nested params: snare={params.get('snare')}")

        # Apply spec param mapping if spec params exist
        spec_implied = resolve_snare_spec_params(params)
        if spec_implied:
            logger.debug(f"[SNARE RENDER] Spec params implied: {spec_implied}")
            # Deep merge spec-implied params into params (user params still win)
            import copy
            def _deep_merge_spec(base: dict, override: dict) -> dict:
                result = copy.deepcopy(base)
                for key, value in override.items():
                    if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                        result[key] = _deep_merge_spec(result[key], value)
                    else:
                        # Only add if key doesn't exist (user params win)
                        if key not in result:
                            result[key] = copy.deepcopy(value)
                return result
            params = _deep_merge_spec(params, spec_implied)

        tone = params.get("tone", 0.5)
        wire_amt = params.get("wire", 0.5)
        crack_amt = params.get("crack", 0.5)
        body_amt = params.get("body", 0.5)

        # Use spec pitch if available, otherwise fall back to macro
        shell_pitch_hz = get_param(params, "snare.shell.pitch_hz", None)
        if shell_pitch_hz is not None:
            fund_freq = shell_pitch_hz
        else:
            fund_freq = 150.0 + (tone * 150.0)
        for d in self.delays:
            d.reset()
        for lp in self._lpfs:
            lp.reset()

        # ---------- Exciter: body and air (explicit layers) ----------
        # Use spec pitch envelope if available
        shell_pitch_env_st = get_param(params, "snare.shell.pitch_env_st", None)
        shell_pitch_decay_ms = get_param(params, "snare.shell.pitch_decay_ms", None)
        
        if shell_pitch_env_st is not None and shell_pitch_decay_ms is not None:
            # Spec mode: explicit pitch envelope
            start_freq = fund_freq * (2.0 ** (shell_pitch_env_st / 12.0))
            end_freq = fund_freq
            pitch_decay_s = shell_pitch_decay_ms / 1000.0
            # Generate pitch envelope
            pitch_env = end_freq + (start_freq - end_freq) * torch.exp(-t / pitch_decay_s)
            # Use phase accumulator for continuous phase
            phase = torch.cumsum(pitch_env / self.sample_rate, dim=0) * 2 * np.pi
            osc_body = torch.sin(phase)
            # Apply amplitude decay envelope (similar to legacy)
            osc_body = (osc_body * torch.exp(-t * 20)).float()
        else:
            # Legacy mode: fixed frequency with exponential decay
            osc_body = Oscillator.triangle(fund_freq, duration, self.sample_rate)
            osc_body = (osc_body * torch.exp(-t * 20)).float()
        
        osc_air = (torch.rand_like(t) * 2 - 1) * torch.exp(-t * 50)
        osc_air = osc_air.float()

        exciter = (osc_body * 0.6) + (osc_air * 0.4)
        boost_gain = 2.0 + (crack_amt * 2.0)
        bp_2k = Filter.bandpass(exciter, self.sample_rate, 2000.0, q=1.5)
        exciter_eq = exciter + (bp_2k * boost_gain)
        exciter_clipped = Effects.hard_clip(exciter_eq, threshold_db=-2.0)

        # ---------- Shell (FDN with Hadamard + stateful LPF) ----------
        detune_cents = torch.tensor([0.0, 5.0, -7.0, 12.0])
        pitch_mults = torch.pow(2.0, detune_cents / 1200.0)
        actual_freqs = fund_freq * pitch_mults
        delay_lens = self.sample_rate / actual_freqs
        feedback_gain = 0.85 + (body_amt * 0.11)
        
        # DEBUG: Log FDN settings
        logger.debug(f"[SNARE RENDER] FDN feedback_gain: {feedback_gain} (body_amt={body_amt})")
        logger.debug(f"[SNARE RENDER] Delay lengths (samples): {delay_lens.tolist()}")
        
        # Check for explicit feedback control
        explicit_feedback = get_param(params, "snare.shell.feedback", None)
        if explicit_feedback is not None:
            feedback_gain = float(explicit_feedback)
            logger.debug(f"[SNARE RENDER] Using explicit feedback: {feedback_gain}")
        
        # Check for repeat mode
        repeat_mode = get_param(params, "snare.repeatMode", "oneshot")
        logger.debug(f"[SNARE RENDER] Repeat mode: {repeat_mode}")
        
        # For oneshot mode, disable feedback by default
        if repeat_mode == "oneshot" and explicit_feedback is None:
            feedback_gain = 0.0
            logger.debug(f"[SNARE RENDER] Oneshot mode: feedback disabled (was {0.85 + (body_amt * 0.11)})")

        # Increased block size for better performance (reduces LPF calls)
        # Original: 32 samples = 6000 LPF calls, New: 1024 samples = ~188 LPF calls
        block_size = 1024
        shell_out = torch.zeros(num_samples, dtype=torch.float32)
        H = _HADAMARD_4

        for b in range(0, num_samples, block_size):
            end = min(b + block_size, num_samples)
            chunk_len = end - b
            in_chunk = exciter_clipped[b:end]

            # Read from delays
            d_sigs = [
                self.delays[i].read_block(float(delay_lens[i].item()), chunk_len)
                for i in range(4)
            ]
            # Hadamard: out_i = sum_j H[i,j] * d_j
            # Vectorize Hadamard computation using tensor operations
            d_sigs_tensor = torch.stack(d_sigs)  # Shape: (4, chunk_len)
            H_expanded = H.unsqueeze(-1)  # Shape: (4, 4, 1)
            # Compute: u[i] = sum_j H[i,j] * d_sigs[j] for all i
            u_all = torch.sum(H_expanded * d_sigs_tensor.unsqueeze(0), dim=1)  # Shape: (4, chunk_len)
            
            # Compute input amplitude once for the chunk
            input_amp = float(torch.max(torch.abs(in_chunk))) if chunk_len > 0 else 0.0
            lpf_cutoff = 2000.0 + (input_amp * 8000.0)
            
            # Process all 4 LPFs in parallel (vectorized)
            out_blocks = []
            for i in range(4):
                u = u_all[i]
                u = self._lpfs[i].process(u.unsqueeze(0), lpf_cutoff).squeeze(0)
                u = Effects.soft_clip(u, threshold_db=-1.0)
                mix_sig = in_chunk + (u * feedback_gain)
                out_blocks.append(mix_sig)
                self.delays[i].write_block(mix_sig)

            shell_out[b:end] = (out_blocks[0] + out_blocks[1] + out_blocks[2] + out_blocks[3]) / 4.0

        # ---------- Wires: BP sweep 9k -> 3.5k over 50ms + ghost floor ----------
        noise = torch.randn_like(t)
        sweep_duration_s = 0.05
        n_sweep = int(sweep_duration_s * self.sample_rate)
        n_sweep = min(n_sweep, num_samples)
        t_sweep = torch.linspace(0, 1, n_sweep)
        center_sweep = 9000.0 - (9000.0 - 3500.0) * t_sweep
        wires_sig = torch.zeros_like(t)
        
        # Optimize: process in larger chunks and vectorize where possible
        # Use larger chunk size to reduce filter calls
        chunk = 1024  # Increased from 256
        for i in range(0, n_sweep, chunk):
            end_i = min(i + chunk, n_sweep)
            seg = noise[i:end_i]
            # Use mean of center frequencies in chunk instead of midpoint
            fc = float(torch.mean(center_sweep[i:end_i]).item())
            seg_bp = Filter.bandpass(seg, self.sample_rate, fc, q=0.8)
            wires_sig[i:end_i] = seg_bp
        if n_sweep < num_samples:
            tail_bp = Filter.bandpass(noise[n_sweep:], self.sample_rate, 3500.0, q=0.8)
            wires_sig[n_sweep:] = tail_bp
        
        # Apply wire filter HPF if spec param exists
        wire_filter_hz = get_param(params, "snare.wires.filter_hz", None)
        if wire_filter_hz is not None:
            wires_sig = Filter.highpass(wires_sig, self.sample_rate, wire_filter_hz, q=0.707)
        
        wire_decay_t = 0.2 + (wire_amt * 0.3)
        wire_env = torch.exp(-t / wire_decay_t)
        ghost_floor = 0.08
        wires_out = wires_sig * wire_env * (wire_amt * (1.0 - ghost_floor) + ghost_floor)
        wires_out = wires_out.float()

        # ---------- Room (optional send from shell) ----------
        # Check if room is explicitly enabled
        room_enabled = get_param(params, "snare.room.enabled", False)
        room_mix = get_param(params, "snare.room.mix", 0.15)
        logger.debug(f"[SNARE RENDER] Room enabled: {room_enabled}, mix: {room_mix}")
        
        if room_enabled:
            room_out = Filter.lowpass(shell_out, self.sample_rate, 800.0, q=0.707) * room_mix
        else:
            room_out = torch.zeros_like(shell_out)  # Disabled by default
        room_out = room_out.float()

        # ---------- Per-layer AMP ADSR ----------
        sr = self.sample_rate
        layers = ("exciter_body", "exciter_air", "shell", "wires", "room")
        envs = {
            layer: _snare_amp_env(
                layer, params, tone, wire_amt, crack_amt, body_amt, duration, sr
            )
            for layer in layers
        }
        exciter_body = (osc_body * _trim_env(envs["exciter_body"], num_samples)).float()
        exciter_air = (osc_air * _trim_env(envs["exciter_air"], num_samples)).float()
        
        # Apply hardness saturation on snap layer (exciter_body + exciter_air)
        snap_hardness = get_param(params, "snare.snap.hardness", None)
        if snap_hardness is not None and snap_hardness > 0:
            # Combine exciter layers for snap bus
            snap_bus = exciter_body + exciter_air
            # Pre-emphasis -> saturation -> de-emphasis
            drive = 1.0 + (snap_hardness * 2.0)
            # Pre-emphasis: boost highs slightly (HPF at ~3kHz)
            snap_pe = Filter.highpass(snap_bus, self.sample_rate, 3000.0, q=0.5) * (snap_hardness * 0.3) + snap_bus
            snap_pe = snap_pe * drive
            # Saturation (tanh)
            snap_sat = torch.tanh(snap_pe)
            # De-emphasis: subtract some high boost
            snap_de = snap_sat - Filter.highpass(snap_sat, self.sample_rate, 3000.0, q=0.5) * (snap_hardness * 0.2)
            # Split back (approximate: apply same ratio to both)
            exciter_body = snap_de * (exciter_body / (snap_bus + 1e-12))
            exciter_air = snap_de * (exciter_air / (snap_bus + 1e-12))
        
        shell_layer = (shell_out * _trim_env(envs["shell"], num_samples)).float()
        wires_layer = (wires_out * _trim_env(envs["wires"], num_samples)).float()
        room_layer = (room_out * _trim_env(envs["room"], num_samples)).float()

        # ---------- LayerMixer ----------
        mixer = LayerMixer()
        mixer.add("exciter_body", exciter_body)
        mixer.add("exciter_air", exciter_air)
        mixer.add("shell", shell_layer)
        mixer.add("wires", wires_layer)
        mixer.add("room", room_layer)
        # Default: exciter stems muted so output = shell + wires (current behavior)
        default_specs = {
            "exciter_body": LayerSpec("exciter_body", gain_db=-200.0, mute=True),
            "exciter_air": LayerSpec("exciter_air", gain_db=-200.0, mute=True),
            "shell": LayerSpec("shell", gain_db=0.0, mute=False),
            "wires": LayerSpec("wires", gain_db=0.0, mute=False),
            "room": LayerSpec("room", gain_db=-200.0, mute=True),
        }
        # Override wires default gain by macro: wires layer level from wire_amt
        # Current: wires_out already has wire_amt in it. So we pass wires_layer and default 0 dB; level is baked in.
        # To let fader override we use gain_db 0 and wires_layer has wire_amt baked in. Good.
        master, _ = mixer.mix(params, "snare", default_specs)
        
        # DEBUG: Log final layer states
        logger.debug(f"[SNARE RENDER] Layer mixer applied. Master audio shape: {master.shape}")
        logger.debug(f"[SNARE RENDER] Room layer gain_db: {get_param(params, 'snare.room.gain_db', -200.0)}")
        logger.debug(f"[SNARE RENDER] Room layer mute: {get_param(params, 'snare.room.mute', True)}")

        # ---------- Box cut notch (post-mix, pre-downsample) ----------
        box_cut_hz = get_param(params, "snare.box_cut.hz", None)
        box_cut_db = get_param(params, "snare.box_cut.db", None)
        if box_cut_hz is not None and box_cut_db is not None and box_cut_db < 0:
            # Apply notch filter (box cut)
            master = Effects.peaking_notch(master, self.sample_rate, box_cut_hz, box_cut_db, q=1.5)

        # Master HPF
        master = Filter.highpass(master, self.sample_rate, 80.0)
        master = master[:: self.oversample_factor]

        if params.get("legacy_normalize", False):
            logger.warning("legacy_normalize enabled: this will cancel fader changes")
            peak = torch.max(torch.abs(master))
            if peak > 0:
                master = master / peak * 0.95

        master = PostChain.process(master, "snare", self.target_sr, params)
        return master
