/**
 * Web Audio API playback hook — replaces wavesurfer.js.
 * Decodes audio blob URLs and plays through AudioContext.
 * Exposes play/stop and isPlaying state.
 */

import { useRef, useState, useCallback, useEffect } from "react";

let _audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!_audioContext) {
    _audioContext = new AudioContext();
  }
  return _audioContext;
}

export interface UseAudioPlaybackReturn {
  /** Play the current audio buffer from the start */
  play: () => void;
  /** Stop playback */
  stop: () => void;
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Decoded audio buffer (null until loaded) */
  audioBuffer: AudioBuffer | null;
  /** Duration in seconds */
  duration: number;
}

export function useAudioPlayback(audioUrl: string | null): UseAudioPlaybackReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Decode audio when URL changes
  useEffect(() => {
    if (!audioUrl) {
      setAudioBuffer(null);
      return;
    }

    let cancelled = false;

    async function decode() {
      try {
        const response = await fetch(audioUrl!);
        const arrayBuffer = await response.arrayBuffer();
        const ctx = getAudioContext();
        const decoded = await ctx.decodeAudioData(arrayBuffer);
        if (!cancelled) {
          setAudioBuffer(decoded);
        }
      } catch (err) {
        console.error("[useAudioPlayback] decode error:", err);
      }
    }

    decode();

    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  // Auto-play when new buffer is decoded
  useEffect(() => {
    if (audioBuffer) {
      playBuffer(audioBuffer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioBuffer]);

  const playBuffer = useCallback(
    (buffer: AudioBuffer) => {
      // Stop previous
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch {
          // already stopped
        }
      }

      const ctx = getAudioContext();
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        setIsPlaying(false);
        sourceRef.current = null;
      };
      source.start(0);
      sourceRef.current = source;
      setIsPlaying(true);
    },
    []
  );

  const play = useCallback(() => {
    if (audioBuffer) {
      playBuffer(audioBuffer);
    }
  }, [audioBuffer, playBuffer]);

  const stop = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        // already stopped
      }
      sourceRef.current = null;
      setIsPlaying(false);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch {
          // already stopped
        }
      }
    };
  }, []);

  return {
    play,
    stop,
    isPlaying,
    audioBuffer,
    duration: audioBuffer?.duration ?? 0,
  };
}
