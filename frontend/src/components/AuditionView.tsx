"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { generateAudio, sendFeedback, proposeParams, exportKit } from "@/lib/api";
import { WaveformViewer } from "./WaveformViewer";
import { HeaderBar } from "./HeaderBar";
import { EnvelopeStrip } from "./envelopes/EnvelopeStrip";
import { InstrumentSections } from "./InstrumentSections";
import { RefreshCw, ThumbsUp, ThumbsDown, Sparkles, Download, Plus, Check, Play } from "lucide-react";
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
    const lastTriggerTimeRef = useRef<number>(0);
    const TRIGGER_DEBOUNCE_MS = 50;
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
        requestAnimationFrame(() => {
            const engineParams = getEngineParamsForInstrument(inst, macroDefaults, defaults, seed, kit[inst]);
            handleGenerate(inst, undefined, undefined, engineParams);
        });
    };

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
            return;
        }
        lastTriggerTimeRef.current = now;

        const instIdx = instOverride ?? instrument;
        const currentSeed = seedOverride ?? seed;
        const macroP = paramsOverride ?? paramsRef.current;
        const envP = envelopeParamsOverride ?? envelopeParamsRef.current;

        const engineParams: EngineParams = engineParamsOverride ?? getEngineParamsForInstrument(
            instIdx, macroP, envP, currentSeed, kit[instIdx]
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
        const engineParams = getEngineParamsForInstrument(instrument, macroDefaults, defaults, seed, undefined);
        handleGenerate(instrument, undefined, undefined, engineParams);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        return () => {
            if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
        };
    }, []);

    // Control audit (dev only)
    useEffect(() => {
        if (process.env.NODE_ENV !== "development") return;
        const { envelope: specEnvelopeIds, macro: specMacroIds } = getAllSpecParamIds(instrument);
        const patchMacroKeys = Object.keys(params);
        const patchEnvelopeKeys = Object.keys(envelopeParams);
        const notInSpecMacro = patchMacroKeys.filter((k) => !specMacroIds.includes(k));
        const notInSpecEnvelope = patchEnvelopeKeys.filter((k) => !specEnvelopeIds.includes(k));
        console.group("[Control Audit]");
        console.log("Controls rendered (from spec):", { macro: specMacroIds, envelope: specEnvelopeIds });
        if (notInSpecMacro.length > 0 || notInSpecEnvelope.length > 0) {
            console.warn("Params in patch but not in spec:", {
                macro: notInSpecMacro.length ? notInSpecMacro : undefined,
                envelope: notInSpecEnvelope.length ? notInSpecEnvelope : undefined,
            });
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
        setKit(prev => ({ ...prev, [instrument]: patchLike }));
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const blob = await exportKit({ name: "NeuroKit Unnamed", slots: kit });
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
        if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
        previewTimeoutRef.current = setTimeout(() => {
            const engineParams = getEngineParamsForInstrument(
                instrument, paramsRef.current, envelopeParamsRef.current, seed, kit[instrument]
            );
            handleGenerate(undefined, undefined, undefined, engineParams);
        }, 300);
    };

    const updateEnvelopeParam = (paramId: string, value: number) => {
        const updated = { ...envelopeParamsRef.current, [paramId]: value };
        envelopeParamsRef.current = updated;
        setEnvelopeParams(prev => ({ ...prev, [paramId]: value }));
        if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
        previewTimeoutRef.current = setTimeout(() => {
            const engineParams = getEngineParamsForInstrument(
                instrument, paramsRef.current, envelopeParamsRef.current, seed, kit[instrument]
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
                instrument, paramsRef.current, next, seed, kit[instrument]
            );
            setTimeout(() => handleGenerate(undefined, undefined, undefined, engineParams), 0);
        }
    };

    const inKit = kit[instrument]?.seed === seed;

    // Keyboard Shortcuts
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            switch (e.code) {
                case 'Enter':
                case 'KeyN':
                    e.preventDefault();
                    nextSeed();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    switchInstrument(INSTRUMENTS[(INSTRUMENTS.indexOf(instrument) + 1) % INSTRUMENTS.length]);
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    switchInstrument(INSTRUMENTS[(INSTRUMENTS.indexOf(instrument) - 1 + INSTRUMENTS.length) % INSTRUMENTS.length]);
                    break;
                case 'KeyM':
                    handlePropose();
                    break;
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [instrument, params, seed]);

    const spec = getEnvelopeSpec(instrument);

    return (
        <div className="flex flex-col h-screen bg-neutral-950 text-neutral-200">
            {/* Header */}
            <HeaderBar
                instrument={instrument}
                onSwitchInstrument={switchInstrument}
                seed={seed}
                isLoading={isLoading}
                onGenerate={nextSeed}
            />

            {/* Main content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Main panel */}
                <main className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
                    {/* Waveform */}
                    <div className="relative h-20 bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden">
                        <WaveformViewer audioUrl={audioUrl} height={80} />
                        {isLoading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                                <RefreshCw className="animate-spin text-emerald-500" size={18} />
                            </div>
                        )}
                    </div>

                    {/* Envelope graphs (stacked, full-width) */}
                    <EnvelopeStrip
                        spec={spec}
                        values={envelopeParams}
                        onChange={updateEnvelopeParam}
                        onReset={resetEnvelope}
                    />

                    {/* Section panels (knobs) */}
                    <InstrumentSections
                        instrument={instrument}
                        spec={spec}
                        macroValues={params}
                        envelopeValues={envelopeParams}
                        onMacroChange={updateParam}
                        onEnvelopeChange={updateEnvelopeParam}
                    />

                    {/* Action bar */}
                    <div className="flex items-center gap-3 bg-neutral-900/50 p-3 rounded-lg border border-neutral-800">
                        {/* AI Suggest */}
                        <button
                            onClick={handlePropose}
                            className="flex items-center gap-2 text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors uppercase tracking-wider"
                            title="Shortcut: M"
                        >
                            <Sparkles size={14} />
                            AI Suggest
                        </button>

                        <div className="flex-1" />

                        {/* Feedback */}
                        <div className="flex gap-1">
                            <button
                                onClick={() => handleFeedback(0)}
                                disabled={feedbackSent !== null}
                                className={clsx(
                                    "p-1.5 rounded hover:bg-neutral-800 transition-colors",
                                    feedbackSent === 0 ? "text-red-500" : "text-neutral-600"
                                )}
                            >
                                <ThumbsDown size={16} />
                            </button>
                            <button
                                onClick={() => handleFeedback(1)}
                                disabled={feedbackSent !== null}
                                className={clsx(
                                    "p-1.5 rounded hover:bg-neutral-800 transition-colors",
                                    feedbackSent === 1 ? "text-emerald-500" : "text-neutral-600"
                                )}
                            >
                                <ThumbsUp size={16} />
                            </button>
                        </div>

                        {/* Replay */}
                        <button
                            onClick={() => handleGenerate()}
                            className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
                            title="Replay"
                        >
                            <Play size={14} />
                        </button>

                        {/* Add to Kit */}
                        <button
                            onClick={addToKit}
                            className={clsx(
                                "p-2 rounded-lg transition-colors",
                                inKit
                                    ? "bg-emerald-900/50 text-emerald-500 border border-emerald-500/50"
                                    : "bg-neutral-800 hover:bg-neutral-700 text-white"
                            )}
                        >
                            {inKit ? <Check size={14} /> : <Plus size={14} />}
                        </button>
                    </div>
                </main>

                {/* Kit sidebar */}
                <aside className="w-52 border-l border-neutral-800 p-4 flex flex-col gap-4 shrink-0 bg-neutral-950">
                    <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                        Current Kit
                    </h3>

                    <div className="flex flex-col gap-2">
                        {INSTRUMENTS.map(inst => (
                            <div
                                key={inst}
                                className={clsx(
                                    "flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors",
                                    instrument === inst
                                        ? "bg-neutral-900 border-neutral-700"
                                        : "bg-black/30 border-neutral-800 hover:bg-neutral-900/50"
                                )}
                                onClick={() => switchInstrument(inst)}
                            >
                                <span className="text-xs font-medium capitalize text-neutral-300">{inst}</span>
                                {kit[inst] ? (
                                    <span className="text-[10px] text-emerald-500 font-mono">Set</span>
                                ) : (
                                    <span className="text-[10px] text-neutral-700 italic">Empty</span>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="pt-3 border-t border-neutral-800 mt-auto">
                        <button
                            onClick={handleExport}
                            disabled={Object.keys(kit).length === 0 || isExporting}
                            className="w-full bg-white text-black font-bold py-2.5 rounded-lg text-xs hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 uppercase tracking-wider"
                        >
                            {isExporting ? (
                                <RefreshCw className="animate-spin" size={14} />
                            ) : (
                                <Download size={14} />
                            )}
                            Export Kit
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    );
}
