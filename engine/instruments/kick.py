"""
Kick engine: sub, click, knock, room layers with optional per-layer ADSR and faders.
Macro params (punch_decay, click_amount, click_snap, blend, etc.) preserved; new params are optional.
"""
import logging
import torch
import numpy as np
from engine.dsp.envelopes import ADSR, ms_to_s
from engine.dsp.filters import Filter, Effects
from engine.dsp.delay import DelayLine
from engine.dsp.postchain import PostChain
from engine.dsp.mixer import LayerMixer, LayerSpec
from engine.core.params import get_param, get_db_gain

logger = logging.getLogger(__name__)


def resolve_kick_spec_params(params: dict) -> dict:
    """
    Map kick.spec.* parameters to internal params.
    Only applies if any kick.spec.* keys exist.
    User-provided advanced params take precedence (not overwritten).
    
    Returns a dict of implied internal params that should be merged with user params.
    """
    # Check if spec params exist
    spec_prefix = "kick.spec."
    has_spec = any(key.startswith(spec_prefix) for key in params.keys()) or (
        "kick" in params and isinstance(params.get("kick"), dict) and "spec" in params.get("kick", {})
    )
    
    if not has_spec:
        return {}
    
    implied = {}
    
    # Helper to get spec param with default
    def get_spec(key: str, default: float) -> float:
        # Try nested: params["kick"]["spec"][key]
        if "kick" in params and isinstance(params["kick"], dict):
            if "spec" in params["kick"] and isinstance(params["kick"]["spec"], dict):
                if key in params["kick"]["spec"]:
                    try:
                        return float(params["kick"]["spec"][key])
                    except (TypeError, ValueError):
                        pass
        # Try flat: params["kick.spec.key"]
        flat_key = f"kick.spec.{key}"
        val = get_param(params, flat_key, default)
        try:
            return float(val)
        except (TypeError, ValueError):
            return default
    
    # Get spec values
    click_level = get_spec("click_level", 0.5)
    click_attack_ms = get_spec("click_attack_ms", 0.5)
    click_filter_hz = get_spec("click_filter_hz", 7000.0)
    hardness = get_spec("hardness", 0.6)
    pitch_hz = get_spec("pitch_hz", 55.0)
    pitch_env_semitones = get_spec("pitch_env_semitones", 24.0)
    pitch_decay_ms = get_spec("pitch_decay_ms", 50.0)
    amp_decay_ms = get_spec("amp_decay_ms", 350.0)
    drive_fold = get_spec("drive_fold", 0.0)
    eq_scoop_hz = get_spec("eq_scoop_hz", 300.0)
    eq_scoop_db = get_spec("eq_scoop_db", -6.0)
    global_attack_ms = get_spec("global_attack_ms", 0.0)
    comp_ratio = get_spec("comp_ratio", 3.0)
    comp_attack_ms = get_spec("comp_attack_ms", 5.0)
    comp_release_ms = get_spec("comp_release_ms", 200.0)
    
    # Clamp to safe ranges
    click_level = max(0.0, min(1.0, click_level))
    click_attack_ms = max(0.0, min(5.0, click_attack_ms))
    click_filter_hz = max(200.0, min(16000.0, click_filter_hz))
    hardness = max(0.0, min(1.0, hardness))
    pitch_hz = max(40.0, min(150.0, pitch_hz))
    pitch_env_semitones = max(0.0, min(100.0, pitch_env_semitones))
    pitch_decay_ms = max(10.0, min(300.0, pitch_decay_ms))
    amp_decay_ms = max(150.0, min(800.0, amp_decay_ms))
    drive_fold = max(0.0, min(1.0, drive_fold))
    eq_scoop_hz = max(200.0, min(400.0, eq_scoop_hz))
    eq_scoop_db = max(-9.0, min(0.0, eq_scoop_db))
    global_attack_ms = max(0.0, min(10.0, global_attack_ms))
    comp_ratio = max(1.0, min(4.0, comp_ratio))
    comp_attack_ms = max(1.0, min(20.0, comp_attack_ms))
    comp_release_ms = max(50.0, min(400.0, comp_release_ms))
    
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
    
    # Body/Sub layer
    if not has_user("kick.sub.amp.decay_ms"):
        implied.setdefault("kick", {}).setdefault("sub", {}).setdefault("amp", {})["decay_ms"] = amp_decay_ms
    if not has_user("kick.sub.amp.attack_ms"):
        implied.setdefault("kick", {}).setdefault("sub", {}).setdefault("amp", {})["attack_ms"] = global_attack_ms
    
    # Pitch: set tune (fundamental)
    if not has_user("tune") and not has_user("kick.tune"):
        implied["tune"] = pitch_hz
    
    # Pitch envelope params (new)
    if not has_user("kick.pitch_env.semitones"):
        implied.setdefault("kick", {}).setdefault("pitch_env", {})["semitones"] = pitch_env_semitones
    if not has_user("kick.pitch_env.decay_ms"):
        implied.setdefault("kick", {}).setdefault("pitch_env", {})["decay_ms"] = pitch_decay_ms
    
    # Click layer
    if not has_user("kick.click.gain_db"):
        # click_level: 0.0 -> -24dB, 0.5 -> -12dB, 1.0 -> 0dB (perceptual curve)
        # Use exponential curve: -24 * (1 - click_level^2)
        implied.setdefault("kick", {}).setdefault("click", {})["gain_db"] = -24.0 * (1.0 - click_level ** 2)
    if not has_user("kick.click.amp.attack_ms"):
        implied.setdefault("kick", {}).setdefault("click", {}).setdefault("amp", {})["attack_ms"] = click_attack_ms
    if not has_user("kick.click.amp.decay_ms"):
        # Default click decay ~6-10ms
        implied.setdefault("kick", {}).setdefault("click", {}).setdefault("amp", {})["decay_ms"] = 8.0
    
    # Click filter
    if not has_user("kick.click.filter_hz"):
        implied.setdefault("kick", {}).setdefault("click", {})["filter_hz"] = click_filter_hz
    
    # Hardness (transient saturation)
    if not has_user("kick.click.hardness"):
        implied.setdefault("kick", {}).setdefault("click", {})["hardness"] = hardness
    
    # Body drive (per-layer, oversampled)
    if not has_user("kick.sub.drive_fold"):
        implied.setdefault("kick", {}).setdefault("sub", {})["drive_fold"] = drive_fold
    
    # Knock attack
    if not has_user("kick.knock.amp.attack_ms"):
        implied.setdefault("kick", {}).setdefault("knock", {}).setdefault("amp", {})["attack_ms"] = global_attack_ms
    
    # EQ scoop
    if not has_user("kick.eq.scoop_hz"):
        implied.setdefault("kick", {}).setdefault("eq", {})["scoop_hz"] = eq_scoop_hz
    if not has_user("kick.eq.scoop_db"):
        implied.setdefault("kick", {}).setdefault("eq", {})["scoop_db"] = eq_scoop_db
    
    # Compressor
    if not has_user("kick.comp.ratio"):
        implied.setdefault("kick", {}).setdefault("comp", {})["ratio"] = comp_ratio
    if not has_user("kick.comp.attack_ms"):
        implied.setdefault("kick", {}).setdefault("comp", {})["attack_ms"] = comp_attack_ms
    if not has_user("kick.comp.release_ms"):
        implied.setdefault("kick", {}).setdefault("comp", {})["release_ms"] = comp_release_ms
    
    return implied


def _amp_env_for_layer(
    layer_name: str,
    params: dict,
    punch_decay: float,
    click_snap: float,
    duration_s: float,
    sample_rate: int,
) -> torch.Tensor:
    """Build per-layer amp ADSR from params or macro defaults. Returns envelope tensor."""
    prefix = f"kick.{layer_name}.amp"
    if layer_name == "sub":
        decay_ms = get_param(params, f"{prefix}.decay_ms", (0.1 + punch_decay * 0.4) * 1000)
        attack_ms = get_param(params, f"{prefix}.attack_ms", 0.0)
        sustain = get_param(params, f"{prefix}.sustain", 0.0)
        release_ms = get_param(params, f"{prefix}.release_ms", 0.0)
    elif layer_name == "click":
        decay_ms = get_param(params, f"{prefix}.decay_ms", (0.005 + click_snap * 0.02) * 1000)
        attack_ms = get_param(params, f"{prefix}.attack_ms", 0.0)
        sustain = get_param(params, f"{prefix}.sustain", 0.0)
        release_ms = get_param(params, f"{prefix}.release_ms", 0.0)
    elif layer_name == "knock":
        decay_ms = get_param(params, f"{prefix}.decay_ms", 50.0)
        attack_ms = get_param(params, f"{prefix}.attack_ms", 0.0)
        sustain = get_param(params, f"{prefix}.sustain", 0.0)
        release_ms = get_param(params, f"{prefix}.release_ms", 0.0)
    else:  # room
        decay_ms = get_param(params, f"{prefix}.decay_ms", 200.0)
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


class FMLayer:
    """
    Helper class for a single FM Physics layer.
    Osc 1 (Carrier) <- FM <- Osc 2 (Noise Modulator).
    """
    def __init__(self, sample_rate: int):
        self.sample_rate = sample_rate

    def render(self, 
               duration: float, 
               start_freq: float, 
               end_freq: float, 
               pitch_decay: float,
               amp_decay: float,
               fm_index_amt: float,
               fm_decay: float) -> torch.Tensor:
        num_samples = int(duration * self.sample_rate)
        t = torch.linspace(0, duration, num_samples)
        amp_env = torch.exp(-t / amp_decay)
        pitch_env = end_freq + (start_freq - end_freq) * torch.exp(-t / pitch_decay)
        fm_env = torch.exp(-t / fm_decay) * fm_index_amt
        noise_mod = torch.randn_like(t)
        inst_freq = pitch_env + (noise_mod * fm_env * 5000.0)
        inst_freq = torch.abs(inst_freq)
        # Phase reset on trigger: cumsum starts at 0, ensuring consistent phase
        phase = torch.cumsum(inst_freq / self.sample_rate, dim=0) * 2 * np.pi
        # Note: phase always starts at 0 on each render (torch.cumsum initializes at 0)
        return torch.sin(phase) * amp_env


class KickEngine:
    def __init__(self, sample_rate: int = 48000):
        self.target_sr = sample_rate
        self.oversample_factor = 4
        self.sample_rate = sample_rate * self.oversample_factor
        self.delay_line = DelayLine(int(0.05 * self.sample_rate))
        self.layer_a = FMLayer(self.sample_rate)
        self.layer_b = FMLayer(self.sample_rate)

    def render(self, params: dict, seed: int = 0) -> torch.Tensor:
        torch.manual_seed(seed)
        duration = 0.5

        # Apply spec param mapping if spec params exist
        spec_implied = resolve_kick_spec_params(params)
        if spec_implied:
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

        # Macro params (unchanged)
        punch_decay = params.get("punch_decay", 0.3)
        click_amount = params.get("click_amount", 0.5)
        click_snap = params.get("click_snap", 0.01)
        tune = params.get("tune", 55.0)  # Updated default to 55Hz (realistic)
        room_tone_freq = params.get("room_tone_freq", 150.0)
        room_air = params.get("room_air", 0.3)
        distance_ms = params.get("distance_ms", 10.0)
        blend = params.get("blend", 0.3)

        self.delay_line.reset()

        # ---------- Layer A (punch + click source) ----------
        # Use spec pitch envelope if available, otherwise fall back to macro behavior
        pitch_env_semitones = get_param(params, "kick.pitch_env.semitones", None)
        pitch_env_decay_ms = get_param(params, "kick.pitch_env.decay_ms", None)
        
        if pitch_env_semitones is not None and pitch_env_decay_ms is not None:
            # Spec mode: explicit pitch envelope
            start_freq = tune * (2.0 ** (pitch_env_semitones / 12.0))
            end_freq = tune
            pitch_decay_s = pitch_env_decay_ms / 1000.0
        else:
            # Legacy macro mode: preserve existing behavior
            start_freq = 150.0 + (click_amount * 100.0)
            end_freq = tune
            pitch_decay_s = 0.08
        
        signal_a = self.layer_a.render(
            duration=duration,
            start_freq=start_freq,
            end_freq=end_freq,
            pitch_decay=pitch_decay_s,
            amp_decay=0.1 + (punch_decay * 0.4),
            fm_index_amt=click_amount,
            fm_decay=0.005 + (click_snap * 0.02),
        )

        # Split into sub (low) and click (high) for per-layer control
        crossover_hz = 120.0
        sub_audio = Filter.lowpass(signal_a, self.sample_rate, crossover_hz, q=0.707)
        click_audio_fm = Filter.highpass(signal_a, self.sample_rate, crossover_hz, q=0.707)
        
        # ---------- Click layer: filtered noise burst (spec mode) or FM-derived (legacy) ----------
        click_filter_hz = get_param(params, "kick.click.filter_hz", None)
        hardness = get_param(params, "kick.click.hardness", None)
        
        if click_filter_hz is not None:
            # Spec mode: generate click as filtered noise burst (0-25ms)
            click_duration_s = 0.025  # 25ms max
            click_samples = int(click_duration_s * self.sample_rate)
            click_noise = torch.randn(click_samples, dtype=torch.float32)
            # Apply HPF at click_filter_hz
            click_audio = Filter.highpass(click_noise, self.sample_rate, click_filter_hz, q=0.707)
            
            # Apply hardness saturation (transient-only) with oversampling
            if hardness is not None and hardness > 0:
                # Pre-emphasis -> saturation -> de-emphasis
                drive = 1.0 + (hardness * 2.0)
                # Pre-emphasis: boost highs slightly
                click_pe = Filter.highpass(click_audio, self.sample_rate, click_filter_hz * 0.7, q=0.5) * (hardness * 0.3) + click_audio
                click_pe = click_pe * drive
                # Saturation (tanh) with oversampling wrapper for anti-aliasing
                from engine.dsp.oversample import apply_tanh_distortion
                click_sat = apply_tanh_distortion(click_pe, self.sample_rate, 1.0, oversample_factor=1)
                # De-emphasis: subtract some high boost
                click_audio = click_sat - Filter.highpass(click_sat, self.sample_rate, click_filter_hz * 0.7, q=0.5) * (hardness * 0.2)
            
            # Pad or trim to match signal_a length
            if click_audio.shape[-1] < signal_a.shape[-1]:
                click_audio = torch.nn.functional.pad(click_audio, (0, signal_a.shape[-1] - click_audio.shape[-1]))
            else:
                click_audio = click_audio[:signal_a.shape[-1]]
        else:
            # Legacy mode: use FM-derived click
            click_audio = click_audio_fm

        # ---------- Knock (damped sine, speaker knock) ----------
        freq_norm = get_param(params, "kick.knock.freq_norm", 0.5)
        try:
            freq_norm = float(freq_norm)
        except (TypeError, ValueError):
            freq_norm = 0.5
        freq_norm = max(0.0, min(1.0, freq_norm))
        knock_freq = 110.0 + (240.0 - 110.0) * freq_norm
        decay_ms = get_param(params, "kick.knock.decay_ms", 50.0)
        try:
            decay_ms = float(decay_ms)
        except (TypeError, ValueError):
            decay_ms = 50.0
        num_samples = signal_a.shape[-1]
        t = torch.linspace(0, duration, num_samples)
        knock_audio = torch.sin(2 * np.pi * knock_freq * t) * torch.exp(-t / (decay_ms / 1000.0 + 1e-6))
        knock_audio = knock_audio.float()

        # ---------- Room (Layer B delayed) ----------
        # Gating: RESEARCH_GUIDANCE room.enabled=false must skip compute (not just mix=0)
        room_enabled = get_param(params, "kick.room.enabled", False)
        if room_enabled:
            signal_b = self.layer_b.render(
                duration=duration,
                start_freq=room_tone_freq,
                end_freq=room_tone_freq,
                pitch_decay=1.0,
                amp_decay=0.2,
                fm_index_amt=room_air * 0.2,
                fm_decay=0.1,
            )
            block_size = 1024
            num_blocks = (len(signal_b) + block_size - 1) // block_size
            signal_b_delayed = torch.zeros_like(signal_b)
            delay_samples = (distance_ms / 1000.0) * self.sample_rate
            for i in range(num_blocks):
                start = i * block_size
                end = min(start + block_size, len(signal_b))
                chunk = signal_b[start:end]
                d_chunk = self.delay_line.read_block(delay_samples, len(chunk))
                self.delay_line.write_block(chunk)
                signal_b_delayed[start:end] = d_chunk
            room_audio = (signal_b_delayed * blend).float()
        else:
            # Skip compute: return zeros (matching signal_a length for mixer)
            num_samples = signal_a.shape[-1]
            room_audio = torch.zeros(num_samples, dtype=torch.float32)

        # ---------- Per-layer amp ADSR ----------
        sr = self.sample_rate
        sub_env = _amp_env_for_layer("sub", params, punch_decay, click_snap, duration, sr)
        click_env = _amp_env_for_layer("click", params, punch_decay, click_snap, duration, sr)
        knock_env = _amp_env_for_layer("knock", params, punch_decay, click_snap, duration, sr)
        room_env = _amp_env_for_layer("room", params, punch_decay, click_snap, duration, sr)

        # Match envelope length to layer length (sample-accurate)
        def trim_env(env: torch.Tensor, length: int) -> torch.Tensor:
            if env.shape[-1] >= length:
                return env[..., :length].clone()
            return torch.nn.functional.pad(env, (0, length - env.shape[-1]))

        n = sub_audio.shape[-1]
        sub_audio = (sub_audio * trim_env(sub_env, n)).float()
        click_audio = (click_audio * trim_env(click_env, n)).float()
        knock_audio = (knock_audio * trim_env(knock_env, n)).float()
        room_audio = (room_audio * trim_env(room_env, n)).float()
        
        # ---------- Body drive_fold (oversampled saturation on sub layer) ----------
        drive_fold = get_param(params, "kick.sub.drive_fold", 0.0)
        if drive_fold > 0:
            # Apply drive with oversampling wrapper (ensures proper anti-aliasing)
            # We're already at 4x oversample, but wrapper handles anti-alias filter + downsampling
            from engine.dsp.oversample import apply_tanh_distortion
            drive = 1.0 + (drive_fold * 2.0)
            # Process at oversampled rate, then anti-alias and downsample
            sub_audio = apply_tanh_distortion(sub_audio, self.sample_rate, drive, oversample_factor=1)
            # Note: factor=1 because we're already at 4x oversample; wrapper still applies anti-alias

        # ---------- LayerMixer: gains/mutes, sum ----------
        mixer = LayerMixer()
        mixer.add("sub", sub_audio)
        mixer.add("click", click_audio)
        mixer.add("knock", knock_audio)
        mixer.add("room", room_audio)
        default_specs = {
            "sub": LayerSpec("sub", gain_db=0.0, mute=False),
            "click": LayerSpec("click", gain_db=0.0, mute=False),
            "knock": LayerSpec("knock", gain_db=0.0, mute=False),
            "room": LayerSpec("room", gain_db=0.0, mute=False),
        }
        master, stems = mixer.mix(params, "kick", default_specs)

        # ---------- EQ Scoop (post-mix, pre-downsample) ----------
        eq_scoop_hz = get_param(params, "kick.eq.scoop_hz", None)
        eq_scoop_db = get_param(params, "kick.eq.scoop_db", None)
        if eq_scoop_hz is not None and eq_scoop_db is not None and eq_scoop_db < 0:
            # Apply notch filter (scoop)
            master = Effects.peaking_notch(master, self.sample_rate, eq_scoop_hz, eq_scoop_db, q=1.0)
        
        # ---------- Compressor (post-mix, pre-downsample) ----------
        comp_ratio = get_param(params, "kick.comp.ratio", None)
        comp_attack_ms = get_param(params, "kick.comp.attack_ms", None)
        comp_release_ms = get_param(params, "kick.comp.release_ms", None)
        if comp_ratio is not None and comp_attack_ms is not None and comp_release_ms is not None:
            master = Effects.compressor(
                master, self.sample_rate, comp_ratio, comp_attack_ms, comp_release_ms, threshold_db=-12.0
            )

        # Saturation (preserve current behavior, but only if not using spec hardness)
        if get_param(params, "kick.click.hardness", None) is None:
            # Legacy mode: use click_amount for saturation (with oversampling wrapper)
            from engine.dsp.oversample import apply_tanh_distortion
            drive = 1.0 + (click_amount * 0.5)
            master = apply_tanh_distortion(master, self.sample_rate, drive, oversample_factor=1)

        # Downsample
        master = Filter.lowpass(master, self.sample_rate, self.target_sr / 2.0 - 1000)
        master = master[:: self.oversample_factor]

        if params.get("legacy_normalize", False):
            logger.warning("legacy_normalize enabled: this will cancel fader changes")
            peak = torch.max(torch.abs(master))
            if peak > 0:
                master = master / peak * 0.95

        master = PostChain.process(master, "kick", self.target_sr, params)
        return master
