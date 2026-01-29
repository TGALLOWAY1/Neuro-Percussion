"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { generateAudio, sendFeedback, proposeParams, exportKit } from "@/lib/api";
import { WaveformViewer } from "./WaveformViewer";
import { MacroSlider } from "./MacroSlider";
import { EnvelopeStrip } from "./envelopes/EnvelopeStrip";
import { RefreshCw, Play, ThumbsUp, ThumbsDown, Sparkles, Download, Plus, Check } from "lucide-react";
import { InstrumentType } from "@/types";
import { getEnvelopeSpec, getCanonicalEnvelopeDefaults, getMacroDefaults, getAllSpecParamIds, getRandomEnvelopeParams } from "@/audio/params";
import { hydratePatchToCanonical, mapCanonicalToEngineParams, type CanonicalPatch, type EngineParams } from "@/audio/contract";
import { validateCanonicalPatch } from "@/audio/patch";
import clsx from "clsx";

const INSTRUMENTS: InstrumentType[] = ['kick', 'snare', 'hat'];

export default function AuditionView() {
    const [instrument, setInstrument] = useState<InstrumentType>('kick');
    const [params, setParams] = useState<Record<string, number>>(() => getMacroDefaults('kick'));
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
    // Refs so debounced generate always uses latest params (avoids stale closure)
    const paramsRef = useRef<Record<string, number>>(params);
    const envelopeParamsRef = useRef<Record<string, number>>(envelopeParams);
    paramsRef.current = params;
    envelopeParamsRef.current = envelopeParams;

    const switchInstrument = (inst: InstrumentType) => {
        setInstrument(inst);
        const macroDefaults = getMacroDefaults(inst);
        setParams(macroDefaults);
        const defaults = getCanonicalEnvelopeDefaults(inst);
        setEnvelopeParams(defaults);
        paramsRef.current = macroDefaults;
        envelopeParamsRef.current = defaults;
        setFeedbackSent(null);
        // Auto-regen with defaults (single mapping path)
        requestAnimationFrame(() => {
            const engineParams = getEngineParamsForInstrument(inst, macroDefaults, defaults, seed, kit[inst]);
            handleGenerate(inst, undefined, undefined, engineParams);
        });
    };

    /** Single entry point: canonical patch -> engine params. Only this path reaches the API. */
    function getEngineParamsForInstrument(
        inst: InstrumentType,
        macroParams: Record<string, number>,
        envParams: Record<string, number>,
        seedVal: number,
        kitPatch?: Record<string, unknown>
    ) {
        const patchLike = {
            schemaVersion: 1,
            params: macroParams,
            envelopeParams: envParams,
            seed: seedVal,
            repeatMode: (kitPatch?.repeatMode as CanonicalPatch["repeatMode"]) ?? "oneshot",
            roomEnabled: (kitPatch?.roomEnabled as boolean) ?? false,
        };
        const canonical = hydratePatchToCanonical(patchLike, inst);
        return mapCanonicalToEngineParams(canonical);
    }

    const handleGenerate = async (
        instOverride?: InstrumentType,
        paramsOverride?: Record<string, number>,
        seedOverride?: number,
        engineParamsOverride?: EngineParams,
        envelopeParamsOverride?: Record<string, number>
    ) => {
        const now = Date.now();
        const timeSinceLastTrigger = now - lastTriggerTimeRef.current;
        if (timeSinceLastTrigger < TRIGGER_DEBOUNCE_MS && !engineParamsOverride) {
            console.debug(`[Generate] Skipping trigger (${timeSinceLastTrigger}ms since last)`);
            return;
        }
        lastTriggerTimeRef.current = now;

        const instIdx = instOverride ?? instrument;
        const currentSeed = seedOverride ?? seed;
        const macroP = paramsOverride ?? paramsRef.current;
        const envP = envelopeParamsOverride ?? envelopeParamsRef.current;

        const engineParams: EngineParams = engineParamsOverride ?? getEngineParamsForInstrument(
            instIdx,
            macroP,
            envP,
            currentSeed,
            kit[instIdx]
        );
        const seedVal = (engineParams as { seed: number }).seed;

        setIsLoading(true);
        setFeedbackSent(null);
        try {
            const blob = await generateAudio(instIdx, engineParams, seedVal);
            const url = URL.createObjectURL(blob);
            setAudioUrl(url);
            if (paramsOverride) setParams(paramsOverride);
            if (seedOverride !== undefined) setSeed(seedOverride);
            if (envelopeParamsOverride) {
                setEnvelopeParams(envelopeParamsOverride);
                envelopeParamsRef.current = envelopeParamsOverride;
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };


    useEffect(() => {
        const macroDefaults = getMacroDefaults(instrument);
        const defaults = getCanonicalEnvelopeDefaults(instrument);
        paramsRef.current = macroDefaults;
        envelopeParamsRef.current = defaults;
        setEnvelopeParams(defaults);
        const engineParams = getEngineParamsForInstrument(
            instrument,
            macroDefaults,
            defaults,
            seed,
            undefined
        );
        handleGenerate(instrument, undefined, undefined, engineParams);
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

    // Control audit (dev only): controls rendered vs params in patch; flag params not in spec
    useEffect(() => {
        if (process.env.NODE_ENV !== "development") return;
        const { envelope: specEnvelopeIds, macro: specMacroIds } = getAllSpecParamIds(instrument);
        const allSpecIds = new Set([...specEnvelopeIds, ...specMacroIds]);
        const patchMacroKeys = Object.keys(params);
        const patchEnvelopeKeys = Object.keys(envelopeParams);
        const notInSpecMacro = patchMacroKeys.filter((k) => !specMacroIds.includes(k));
        const notInSpecEnvelope = patchEnvelopeKeys.filter((k) => !specEnvelopeIds.includes(k));
        console.group("[Control Audit]");
        console.log("Controls rendered (from spec):", {
            macro: specMacroIds,
            envelope: specEnvelopeIds,
        });
        if (notInSpecMacro.length > 0 || notInSpecEnvelope.length > 0) {
            console.warn("Params in patch but not in spec (should be none):", {
                macro: notInSpecMacro.length ? notInSpecMacro : undefined,
                envelope: notInSpecEnvelope.length ? notInSpecEnvelope : undefined,
            });
        } else {
            console.log("Params in patch match spec ids.");
        }
        console.groupEnd();
    }, [instrument, params, envelopeParams]);

    const nextSeed = () => {
        const newSeed = Math.floor(Math.random() * 100000);
        const newEnvelopeParams = getRandomEnvelopeParams(instrument);
        handleGenerate(undefined, undefined, newSeed, undefined, newEnvelopeParams);
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
            const newEnvelopeParams = getRandomEnvelopeParams(instrument);
            await handleGenerate(undefined, newParams, undefined, undefined, newEnvelopeParams);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const addToKit = () => {
        const patchLike = {
            schemaVersion: 1 as const,
            params: { ...params },
            envelopeParams: { ...envelopeParams },
            seed,
            repeatMode: instrument === "snare" ? "oneshot" as const : undefined,
            roomEnabled: false,
        };
        const warnings = validateCanonicalPatch(patchLike as Parameters<typeof validateCanonicalPatch>[0]);
        if (warnings.length > 0) console.warn("[PATCH] Validation warnings:", warnings);

        setKit(prev => ({
            ...prev,
            [instrument]: patchLike
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
        const updated = { ...paramsRef.current, [key]: val };
        paramsRef.current = updated;
        setParams(prev => ({ ...prev, [key]: val }));
        if (previewTimeoutRef.current) {
            clearTimeout(previewTimeoutRef.current);
        }
        previewTimeoutRef.current = setTimeout(() => {
            const engineParams = getEngineParamsForInstrument(
                instrument,
                paramsRef.current,
                envelopeParamsRef.current,
                seed,
                kit[instrument]
            );
            handleGenerate(undefined, undefined, undefined, engineParams);
        }, 300);
    };

    const updateEnvelopeParam = (paramId: string, value: number) => {
        const updated = { ...envelopeParamsRef.current, [paramId]: value };
        envelopeParamsRef.current = updated;
        setEnvelopeParams(prev => ({ ...prev, [paramId]: value }));
        if (previewTimeoutRef.current) {
            clearTimeout(previewTimeoutRef.current);
        }
        previewTimeoutRef.current = setTimeout(() => {
            const engineParams = getEngineParamsForInstrument(
                instrument,
                paramsRef.current,
                envelopeParamsRef.current,
                seed,
                kit[instrument]
            );
            handleGenerate(undefined, undefined, undefined, engineParams);
        }, 300);
    };

    const resetEnvelope = (envelopeId: string) => {
        const spec = getEnvelopeSpec(instrument);
        const envelope = spec.envelopes.find(e => e.id === envelopeId);
        const defaults = getCanonicalEnvelopeDefaults(instrument);
        if (envelope) {
            const updates: Record<string, number> = {};
            envelope.params.forEach(param => {
                updates[param.id] = defaults[param.id] ?? param.default;
            });
            const next = { ...envelopeParamsRef.current, ...updates };
            envelopeParamsRef.current = next;
            setEnvelopeParams(prev => ({ ...prev, ...updates }));
            const engineParams = getEngineParamsForInstrument(
                instrument,
                paramsRef.current,
                next,
                seed,
                kit[instrument]
            );
            setTimeout(() => handleGenerate(undefined, undefined, undefined, engineParams), 0);
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

                {/* Macro controls from ParamSpec only (envelope strip above is primary for sound design) */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-6 z-10">
                    {(getEnvelopeSpec(instrument).macroParams ?? []).map(p => (
                        <MacroSlider
                            key={p.id}
                            label={p.label}
                            value={params[p.id] ?? p.default}
                            min={p.min}
                            max={p.max}
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
