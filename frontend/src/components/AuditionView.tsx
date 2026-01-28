"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { generateAudio, sendFeedback, proposeParams, exportKit } from "@/lib/api";
import { WaveformViewer } from "./WaveformViewer";
import { MacroSlider } from "./MacroSlider";
import { EnvelopeStrip } from "./envelopes/EnvelopeStrip";
import { RefreshCw, Play, ThumbsUp, ThumbsDown, Sparkles, Download, Plus, Check } from "lucide-react";
import { InstrumentType } from "@/types";
import { getEnvelopeSpec } from "@/audio/params";
import { mapKickParams, mapSnareParams, mapHatParams } from "@/audio/mapping";
import { migratePatchToV1, validateCanonicalPatch, type PatchV1 } from "@/audio/patch";
import clsx from "clsx";

const INSTRUMENTS: InstrumentType[] = ['kick', 'snare', 'hat'];

const CONFIG = {
    kick: [
        { id: 'punch_decay', label: 'Punch Decay', min: 0.1, max: 1.0 },
        { id: 'click_amount', label: 'Click Amount', min: 0.0, max: 1.0 },
        { id: 'click_snap', label: 'Click Snap', min: 0.0, max: 1.0 },
        { id: 'room_tone_freq', label: 'Room Tone (Hz)', min: 50.0, max: 300.0 },
        { id: 'room_air', label: 'Room Air', min: 0.0, max: 1.0 },
        { id: 'distance_ms', label: 'Distance (ms)', min: 0.0, max: 50.0 },
        { id: 'blend', label: 'Room Mix', min: 0.0, max: 1.0 },
    ],
    snare: [
        { id: 'tone', label: 'Tone (Shell)', min: 0.0, max: 1.0 },
        { id: 'wire', label: 'Wire (Rattle)', min: 0.0, max: 1.0 },
        { id: 'crack', label: 'Crack (Snap)', min: 0.0, max: 1.0 },
        { id: 'body', label: 'Body (Depth)', min: 0.0, max: 1.0 },
    ],
    hat: [
        { id: 'tightness', label: 'Tightness', min: 0.0, max: 1.0 },
        { id: 'sheen', label: 'Sheen (Air)', min: 0.0, max: 1.0 },
        { id: 'dirt', label: 'Dirt (Sat)', min: 0.0, max: 1.0 },
        { id: 'color', label: 'Color (FM)', min: 0.0, max: 1.0 },
    ],
};

const DEFAULT_PARAMS = {
    kick: {
        punch_decay: 0.5,
        click_amount: 0.5,
        click_snap: 0.5,
        room_tone_freq: 150.0,
        room_air: 0.3,
        distance_ms: 20.0,
        blend: 0.3
    },
    snare: { tone: 0.5, wire: 0.4, crack: 0.5, body: 0.5 },
    hat: { tightness: 0.5, sheen: 0.4, dirt: 0.2, color: 0.5 },
};

export default function AuditionView() {
    const [instrument, setInstrument] = useState<InstrumentType>('kick');
    const [params, setParams] = useState<Record<string, number>>(DEFAULT_PARAMS['kick']);
    const [envelopeParams, setEnvelopeParams] = useState<Record<string, number>>({});
    const [seed, setSeed] = useState(42);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [feedbackSent, setFeedbackSent] = useState<number | null>(null);

    // Kit State
    const [kit, setKit] = useState<Record<string, any>>({});
    const [isExporting, setIsExporting] = useState(false);

    // Debounce timer for real-time preview
    const previewTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    // Prevent double-triggering: track last trigger time
    const lastTriggerTimeRef = useRef<number>(0);
    const TRIGGER_DEBOUNCE_MS = 50; // Minimum time between triggers

    const switchInstrument = (inst: InstrumentType) => {
        setInstrument(inst);
        setParams(DEFAULT_PARAMS[inst]);
        // Reset envelope params to defaults
        const spec = getEnvelopeSpec(inst);
        const defaults: Record<string, number> = {};
        spec.envelopes.forEach((env) => {
            env.params.forEach((param) => {
                defaults[param.id] = param.default;
            });
        });
        setEnvelopeParams(defaults);
        setFeedbackSent(null);
        // Auto-regen with defaults
        requestAnimationFrame(() => {
            // Migrate kit patch if exists
            const kitPatch = kit[inst];
            const migratedPatch = kitPatch ? migratePatchToV1(kitPatch as any) : undefined;
            
            const merged = mergeParams(inst, DEFAULT_PARAMS[inst], defaults, migratedPatch);
            handleGenerate(inst, merged);
        });
    };

    // Merge macro params + envelope params into backend format
    const mergeParams = (
        inst: InstrumentType,
        macroParams: Record<string, number>,
        envParams: Record<string, number>,
        patch?: PatchV1
    ): Record<string, any> => {
        const merged: Record<string, any> = { ...macroParams };

        // Map envelope params to backend format
        let mapped: Record<string, any> = {};
        if (inst === "kick") {
            mapped = mapKickParams(envParams as any);
        } else if (inst === "snare") {
            mapped = mapSnareParams(envParams as any);
            
            // Apply repeat mode and room settings for snare
            const repeatMode = patch?.repeatMode || "oneshot";
            merged["snare"] = merged["snare"] || {};
            merged["snare"]["repeatMode"] = repeatMode;
            
            // Disable FDN feedback for oneshot mode
            if (repeatMode === "oneshot") {
                merged["snare"]["shell"] = merged["snare"]["shell"] || {};
                merged["snare"]["shell"]["feedback"] = 0.0;
            }
            
            // Room layer control
            const roomEnabled = patch?.roomEnabled || false;
            merged["snare"]["room"] = merged["snare"]["room"] || {};
            merged["snare"]["room"]["enabled"] = roomEnabled;
            if (!roomEnabled) {
                merged["snare"]["room"]["mute"] = true;
                merged["snare"]["room"]["gain_db"] = -200.0;
            }
        } else if (inst === "hat") {
            mapped = mapHatParams(envParams as any);
        }

        // Deep merge mapped params into merged
        const deepMerge = (target: any, source: any): any => {
            const result = { ...target };
            for (const key in source) {
                if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
                    result[key] = deepMerge(result[key] || {}, source[key]);
                } else {
                    result[key] = source[key];
                }
            }
            return result;
        };

        return deepMerge(merged, mapped);
    };

    const handleGenerate = async (
        instOverride?: InstrumentType,
        paramsOverride?: Record<string, any>,
        seedOverride?: number,
        skipEnvelopeMerge = false
    ) => {
        // Prevent double-triggering: check if we triggered recently
        const now = Date.now();
        const timeSinceLastTrigger = now - lastTriggerTimeRef.current;
        if (timeSinceLastTrigger < TRIGGER_DEBOUNCE_MS && !skipEnvelopeMerge) {
            console.debug(`[SNARE] Skipping trigger (${timeSinceLastTrigger}ms since last, min ${TRIGGER_DEBOUNCE_MS}ms)`);
            return;
        }
        lastTriggerTimeRef.current = now;

        const instIdx = instOverride || instrument;
        const currentSeed = seedOverride !== undefined ? seedOverride : seed;

        // Merge params if not already merged
        let finalParams: Record<string, any>;
        if (skipEnvelopeMerge && paramsOverride) {
            finalParams = paramsOverride;
        } else {
            const macroP = paramsOverride || params;
            const envP = envelopeParams;
            const kitPatch = kit[instIdx];
            const migratedPatch = kitPatch ? migratePatchToV1(kitPatch as any) : undefined;
            finalParams = mergeParams(instIdx, macroP, envP, migratedPatch);
        }

        setIsLoading(true);
        setFeedbackSent(null);
        try {
            const blob = await generateAudio(instIdx, finalParams, currentSeed);
            const url = URL.createObjectURL(blob);
            setAudioUrl(url);
            if (paramsOverride && !skipEnvelopeMerge) {
                // Only update macro params if provided
                setParams(paramsOverride);
            }
            if (seedOverride !== undefined) setSeed(seedOverride);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };


    useEffect(() => {
        // Initialize envelope params to defaults
        const spec = getEnvelopeSpec(instrument);
        const defaults: Record<string, number> = {};
        spec.envelopes.forEach((env) => {
            env.params.forEach((param) => {
                defaults[param.id] = param.default;
            });
        });
        setEnvelopeParams(defaults);
        
        // Initial generate
        const merged = mergeParams(instrument, DEFAULT_PARAMS[instrument], defaults, undefined);
        handleGenerate(instrument, merged, seed, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Cleanup debounce timer
    useEffect(() => {
        return () => {
            if (previewTimeoutRef.current) {
                clearTimeout(previewTimeoutRef.current);
            }
        };
    }, []);

    const nextSeed = () => {
        const newSeed = Math.floor(Math.random() * 100000);
        // Directly call generate with new seed
        handleGenerate(undefined, undefined, newSeed);
    };

    const handleFeedback = async (label: number) => {
        try {
            await sendFeedback(instrument, params, seed, label);
            setFeedbackSent(label);
        } catch (err) {
            console.error("Feedback failed", err);
        }
    };

    const handlePropose = async () => {
        setIsLoading(true);
        try {
            const newParams = await proposeParams(instrument);
            handleGenerate(undefined, newParams);
        } catch (err) {
            console.error(err);
            setIsLoading(false);
        }
    };

    const addToKit = () => {
        // Create V1 patch with schema version
        const patch: PatchV1 = {
            schemaVersion: 1,
            params: { ...params },
            envelopeParams: { ...envelopeParams },
            seed,
            // For snare, default to oneshot mode
            repeatMode: instrument === "snare" ? "oneshot" : undefined,
            roomEnabled: false, // Default room disabled
        };
        
        // Validate and warn if issues
        const warnings = validateCanonicalPatch(patch);
        if (warnings.length > 0) {
            console.warn("[PATCH] Validation warnings:", warnings);
        }
        
        setKit(prev => ({
            ...prev,
            [instrument]: patch
        }));
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const blob = await exportKit({
                name: "NeuroKit Unnamed",
                slots: kit
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = "neuro_kit.zip";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (err) {
            console.error(err);
        } finally {
            setIsExporting(false);
        }
    };

    const updateParam = (key: string, val: number) => {
        setParams(prev => ({ ...prev, [key]: val }));
        // Trigger real-time preview with debounce
        if (previewTimeoutRef.current) {
            clearTimeout(previewTimeoutRef.current);
        }
        previewTimeoutRef.current = setTimeout(() => {
            const updated = { ...params, [key]: val };
            const kitPatch = kit[instrument];
            const migratedPatch = kitPatch ? migratePatchToV1(kitPatch as any) : undefined;
            const merged = mergeParams(instrument, updated, envelopeParams, migratedPatch);
            handleGenerate(undefined, merged, undefined, true);
        }, 300); // 300ms debounce
    };

    const updateEnvelopeParam = (paramId: string, value: number) => {
        setEnvelopeParams(prev => ({ ...prev, [paramId]: value }));
        // Trigger real-time preview with debounce
        if (previewTimeoutRef.current) {
            clearTimeout(previewTimeoutRef.current);
        }
        previewTimeoutRef.current = setTimeout(() => {
            const updated = { ...envelopeParams, [paramId]: value };
            const kitPatch = kit[instrument];
            const migratedPatch = kitPatch ? migratePatchToV1(kitPatch as any) : undefined;
            const merged = mergeParams(instrument, params, updated, migratedPatch);
            handleGenerate(undefined, merged, undefined, true);
        }, 300); // 300ms debounce
    };

    const resetEnvelope = (envelopeId: string) => {
        const spec = getEnvelopeSpec(instrument);
        const envelope = spec.envelopes.find(e => e.id === envelopeId);
        if (envelope) {
            const updates: Record<string, number> = {};
            envelope.params.forEach(param => {
                updates[param.id] = param.default;
            });
            setEnvelopeParams(prev => ({ ...prev, ...updates }));
            // Trigger preview
            const updated = { ...envelopeParams, ...updates };
            const merged = mergeParams(instrument, params, updated);
            handleGenerate(undefined, merged, undefined, true);
        }
    };

    const inKit = kit[instrument]?.seed === seed;

    // --- Keyboard Shortcuts ---
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    // Replay logic handled by WaveformViewer usually, but we can't trigger it easily from here without ref access to child.
                    // Actually WaveformViewer exposes nothing.
                    // We can just re-gen (fast enough usually) or better: expose replay.
                    // For V1 let's just trigger "Generate" if seed unchanged? No that's waste.
                    // Let's implement document.getElementById play hack or ref?
                    // Best: AuditionView should control "isPlaying" state passed to WaveformViewer?
                    break;
                case 'Enter':
                case 'KeyN':
                    e.preventDefault();
                    nextSeed();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    const idx = INSTRUMENTS.indexOf(instrument);
                    const nextIdx = (idx + 1) % INSTRUMENTS.length;
                    switchInstrument(INSTRUMENTS[nextIdx]);
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    const prevIdx = (INSTRUMENTS.indexOf(instrument) - 1 + INSTRUMENTS.length) % INSTRUMENTS.length;
                    switchInstrument(INSTRUMENTS[prevIdx]);
                    break;
                case 'KeyM': // Mutate/Magic
                    handlePropose();
                    break;
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [instrument, params, seed]); // Re-bind on state change to close over latest

    return (
        <div className="flex gap-8 max-w-5xl mx-auto p-6 items-start">

            {/* LEFT: AUDITION */}
            <div className="flex-1 flex flex-col gap-6 bg-neutral-950 rounded-2xl border border-neutral-800 shadow-2xl relative overflow-hidden p-6">
                {/* Header & Tabs */}
                <div className="flex justify-between items-center border-b border-neutral-800 pb-4 z-10">
                    <h2 className="text-2xl font-bold text-white tracking-tight">
                        Neuro-Percussion
                    </h2>
                    <div className="flex bg-neutral-900 rounded-lg p-1 gap-1">
                        {INSTRUMENTS.map(inst => (
                            <button
                                key={inst}
                                onClick={() => switchInstrument(inst)}
                                className={clsx(
                                    "px-3 py-1 text-xs font-semibold rounded-md uppercase tracking-wider transition-all",
                                    instrument === inst ? "bg-emerald-600 text-white shadow-lg" : "text-neutral-500 hover:text-neutral-300"
                                )}
                            >
                                {inst}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Visualizer */}
                <div className="relative h-32 z-10">
                    <WaveformViewer audioUrl={audioUrl} height={128} />
                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm rounded-lg">
                            <RefreshCw className="animate-spin text-emerald-500" />
                        </div>
                    )}
                </div>

                {/* Envelope Strip */}
                <div className="z-10">
                    <EnvelopeStrip
                        spec={getEnvelopeSpec(instrument)}
                        values={envelopeParams}
                        onChange={updateEnvelopeParam}
                        onReset={resetEnvelope}
                    />
                </div>

                {/* ML Feedback Actions */}
                <div className="flex justify-between items-center bg-neutral-900/50 p-3 rounded-lg border border-neutral-800 z-10">
                    <button
                        onClick={handlePropose}
                        className="flex items-center gap-2 text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors uppercase tracking-wider"
                        title="Shortcut: M"
                    >
                        <Sparkles size={16} />
                        AI Suggest
                    </button>

                    <div className="flex gap-2">
                        <button
                            onClick={() => handleFeedback(0)}
                            disabled={feedbackSent !== null}
                            className={clsx(
                                "p-2 rounded hover:bg-neutral-800 transition-colors",
                                feedbackSent === 0 ? "text-red-500" : "text-neutral-500"
                            )}
                        >
                            <ThumbsDown size={20} />
                        </button>
                        <button
                            onClick={() => handleFeedback(1)}
                            disabled={feedbackSent !== null}
                            className={clsx(
                                "p-2 rounded hover:bg-neutral-800 transition-colors",
                                feedbackSent === 1 ? "text-emerald-500" : "text-neutral-500"
                            )}
                        >
                            <ThumbsUp size={20} />
                        </button>
                    </div>
                </div>

                {/* Controls */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-6 z-10">
                    {CONFIG[instrument].map(p => (
                        <MacroSlider
                            key={p.id}
                            label={p.label}
                            value={params[p.id] || 0}
                            min={p.min ?? 0}
                            max={p.max ?? 1}
                            onChange={(v) => updateParam(p.id, v)}
                        />
                    ))}
                </div>

                {/* Actions */}
                <div className="flex gap-4 pt-4 z-10">
                    <button
                        onClick={nextSeed}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                        title="Shortcut: Enter / N"
                    >
                        <RefreshCw size={18} />
                        Generate New
                        <span className="text-emerald-200 text-xs font-mono opacity-70 ml-2">#{seed}</span>
                    </button>

                    <button
                        onClick={() => handleGenerate()}
                        className="px-6 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold rounded-lg flex items-center justify-center transition-colors"
                        title="Replay"
                    >
                        <Play size={18} />
                    </button>

                    <button
                        onClick={addToKit}
                        className={clsx(
                            "px-6 font-semibold rounded-lg flex items-center justify-center transition-colors",
                            inKit ? "bg-emerald-900/50 text-emerald-500 border border-emerald-500/50" : "bg-neutral-800 hover:bg-neutral-700 text-white"
                        )}
                    >
                        {inKit ? <Check size={18} /> : <Plus size={18} />}
                    </button>
                </div>
            </div>

            {/* RIGHT: KIT BUILDER */}
            <div className="w-64 bg-neutral-900 rounded-2xl border border-neutral-800 p-6 flex flex-col gap-6 h-fit sticky top-6">
                <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wider">
                    Current Kit
                </h3>

                <div className="flex flex-col gap-2">
                    {INSTRUMENTS.map(inst => (
                        <div key={inst} className="flex items-center justify-between p-3 bg-black/40 rounded-lg border border-neutral-800">
                            <span className="text-sm font-medium capitalize text-neutral-300">{inst}</span>
                            {kit[inst] ? (
                                <span className="text-xs text-emerald-500 font-mono">Set</span>
                            ) : (
                                <span className="text-xs text-neutral-600 italic">Empty</span>
                            )}
                        </div>
                    ))}
                </div>

                <div className="pt-4 border-t border-neutral-800">
                    <button
                        onClick={handleExport}
                        disabled={Object.keys(kit).length === 0 || isExporting}
                        className="w-full bg-white text-black font-bold py-3 rounded-lg hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isExporting ? (
                            <RefreshCw className="animate-spin" size={18} />
                        ) : (
                            <Download size={18} />
                        )}
                        Export Kit
                    </button>
                </div>
            </div>
        </div>
    );
}
