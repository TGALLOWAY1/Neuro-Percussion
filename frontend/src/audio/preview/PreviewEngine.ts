/**
 * PreviewEngine — lightweight client-side synthesizer using Web Audio API.
 * Provides instant audio feedback during envelope editing without server round-trips.
 * Phase 5: Hybrid render flow (preview during edit, server render on idle).
 */

import type { BezierEnvelope } from "@/audio/bezier";
import { sampleEnvelope } from "@/audio/bezier";

/** Shared AudioContext singleton */
let _ctx: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!_ctx) {
    _ctx = new AudioContext();
  }
  if (_ctx.state === "suspended") {
    _ctx.resume();
  }
  return _ctx;
}

export interface PreviewParams {
  /** Base frequency in Hz */
  frequency: number;
  /** Amplitude envelope (normalized 0-1 space) */
  ampEnvelope?: BezierEnvelope;
  /** Pitch envelope (normalized 0-1 space, y maps to semitone range) */
  pitchEnvelope?: BezierEnvelope;
  /** Total duration in seconds */
  duration: number;
  /** Pitch range in semitones (for pitch envelope y scaling) */
  pitchRange?: number;
  /** Waveform type */
  waveform?: OscillatorType;
  /** Click/noise amount (0-1) */
  clickAmount?: number;
  /** Click decay in seconds */
  clickDecay?: number;
}

/**
 * Generate a simple preview sound using Web Audio API.
 * Uses OscillatorNode + GainNode with automated envelopes.
 */
export function playPreview(params: PreviewParams): void {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const {
    frequency,
    ampEnvelope,
    pitchEnvelope,
    duration,
    pitchRange = 24,
    waveform = "sine",
    clickAmount = 0,
    clickDecay = 0.01,
  } = params;

  // ── Main oscillator ──────────────────────────────────
  const osc = ctx.createOscillator();
  osc.type = waveform;
  osc.frequency.value = frequency;

  // Apply pitch envelope
  if (pitchEnvelope && pitchEnvelope.nodes.length >= 2) {
    const pitchPoints = sampleEnvelope(pitchEnvelope, 32);
    osc.frequency.setValueAtTime(frequency, now);
    for (const p of pitchPoints) {
      const t = now + p.x * duration;
      const semitones = p.y * pitchRange;
      const freq = frequency * Math.pow(2, semitones / 12);
      osc.frequency.linearRampToValueAtTime(freq, t);
    }
  }

  // ── Gain node (amplitude envelope) ───────────────────
  const gain = ctx.createGain();
  gain.gain.value = 0;

  if (ampEnvelope && ampEnvelope.nodes.length >= 2) {
    const ampPoints = sampleEnvelope(ampEnvelope, 32);
    gain.gain.setValueAtTime(0, now);
    for (const p of ampPoints) {
      const t = now + p.x * duration;
      gain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, p.y)) * 0.5, t);
    }
  } else {
    // Default AD envelope if none provided
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  }

  osc.connect(gain);
  gain.connect(ctx.destination);

  // ── Click/noise burst ────────────────────────────────
  if (clickAmount > 0) {
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(clickAmount * 0.3, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + clickDecay);

    // White noise burst via buffer source (buffer matches clickDecay duration)
    const bufferSize = Math.ceil(ctx.sampleRate * clickDecay);
    const noiseBuffer = ctx.createBuffer(1, Math.max(1, bufferSize), ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseBuffer.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.connect(clickGain);
    clickGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + clickDecay);
    noise.onended = () => {
      noise.disconnect();
      clickGain.disconnect();
    };
  }

  // ── Start and stop ───────────────────────────────────
  osc.start(now);
  osc.stop(now + duration + 0.05);

  // Cleanup (GC-friendly)
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

/**
 * Get the base frequency for an instrument.
 */
export function getInstrumentFrequency(instrument: string): number {
  switch (instrument) {
    case "kick":
      return 55; // A1
    case "snare":
      return 200;
    case "hat":
      return 6000;
    default:
      return 100;
  }
}

/**
 * Get default waveform for an instrument.
 */
export function getInstrumentWaveform(instrument: string): OscillatorType {
  switch (instrument) {
    case "kick":
      return "sine";
    case "snare":
      return "triangle";
    case "hat":
      return "square";
    default:
      return "sine";
  }
}
