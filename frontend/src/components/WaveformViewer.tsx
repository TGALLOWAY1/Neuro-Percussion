import React, { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";

interface WaveformViewerProps {
    audioUrl: string | null;
    height?: number;
    isPlaying?: boolean;
}

export const WaveformViewer: React.FC<WaveformViewerProps> = ({
    audioUrl,
    height = 120,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const wavesurferRef = useRef<WaveSurfer | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        // Initialize
        wavesurferRef.current = WaveSurfer.create({
            container: containerRef.current,
            waveColor: "rgb(52, 211, 153)", // Emerald 400
            progressColor: "rgb(16, 185, 129)", // Emerald 500
            height: height,
            barWidth: 2,
            barGap: 1,
            cursorColor: 'transparent',
        });

        return () => {
            wavesurferRef.current?.destroy();
        };
    }, [height]);

    useEffect(() => {
        if (audioUrl && wavesurferRef.current) {
            wavesurferRef.current.load(audioUrl);
            wavesurferRef.current.on('ready', () => {
                const playPromise = wavesurferRef.current?.play();
                if (playPromise) {
                    playPromise.catch((e) => {
                        // Auto-play blocked. Ignore.
                        console.log("Auto-play prevented (expected on first load)");
                    });
                }
            });
        }
    }, [audioUrl]);

    return <div ref={containerRef} className="w-full bg-neutral-900/50 rounded-lg border border-neutral-800" />;
};
