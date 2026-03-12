"use client";

import React from "react";
import { InstrumentType } from "@/types";
import { DrumParamSpec, EnvelopeSpec, ParamSpec } from "@/audio/params/types";
import { SectionPanel } from "./SectionPanel";
import { Knob } from "./Knob";

interface InstrumentSectionsProps {
    instrument: InstrumentType;
    spec: DrumParamSpec;
    macroValues: Record<string, number>;
    envelopeValues: Record<string, number>;
    onMacroChange: (paramId: string, value: number) => void;
    onEnvelopeChange: (paramId: string, value: number) => void;
}

/** Get envelope params that are NOT time/envelope-shape params (those are in the graph) */
function getNonTimeParams(envelope: EnvelopeSpec): ParamSpec[] {
    const timeKeywords = ["attack", "decay", "hold", "curve"];
    return envelope.params.filter(
        (p) => !timeKeywords.some((kw) => p.id.includes(kw))
    );
}

/** Color for each envelope group */
const ENVELOPE_COLORS: Record<string, string> = {
    amp: "#10B981",     // emerald
    pitch: "#F59E0B",   // amber
    click: "#3B82F6",   // blue
    body: "#F59E0B",    // amber
    noise: "#8B5CF6",   // violet
    snap: "#EF4444",    // red
    metal: "#F59E0B",   // amber
    stereo: "#06B6D4",  // cyan
};

function KnobGrid({ params, values, onChange, color }: {
    params: ParamSpec[];
    values: Record<string, number>;
    onChange: (id: string, value: number) => void;
    color?: string;
}) {
    if (params.length === 0) return null;
    return (
        <div className="flex flex-wrap gap-4 justify-center">
            {params.map((p) => (
                <Knob
                    key={p.id}
                    spec={p}
                    value={values[p.id] ?? p.default}
                    onChange={(v) => onChange(p.id, v)}
                    color={color}
                    size={48}
                />
            ))}
        </div>
    );
}

export const InstrumentSections: React.FC<InstrumentSectionsProps> = ({
    instrument,
    spec,
    macroValues,
    envelopeValues,
    onMacroChange,
    onEnvelopeChange,
}) => {
    // Collect NONE-mode envelopes and non-time params from graph envelopes
    const nonGraphEnvelopes = spec.envelopes.filter((e) => e.mode === "NONE");
    const graphEnvelopes = spec.envelopes.filter((e) => e.mode !== "NONE");

    // Non-time params from graph envelopes go in dedicated section panels
    const graphExtraParams: { envelope: EnvelopeSpec; params: ParamSpec[] }[] = [];
    for (const env of graphEnvelopes) {
        const extras = getNonTimeParams(env);
        if (extras.length > 0) {
            graphExtraParams.push({ envelope: env, params: extras });
        }
    }

    const macros = spec.macroParams ?? [];

    // Calculate columns: auto-fit based on number of sections
    const sectionCount = graphExtraParams.length + nonGraphEnvelopes.length + (macros.length > 0 ? 1 : 0);
    const gridCols = sectionCount <= 2 ? "grid-cols-2" : sectionCount <= 3 ? "grid-cols-3" : "grid-cols-4";

    return (
        <div className={`grid ${gridCols} gap-3`}>
            {/* Non-time params from graph envelopes (e.g., Click Amount, Click Tone for kick) */}
            {graphExtraParams.map(({ envelope, params }) => (
                <SectionPanel
                    key={envelope.id}
                    title={envelope.label}
                    showSettings
                    showMore
                >
                    <KnobGrid
                        params={params}
                        values={envelopeValues}
                        onChange={onEnvelopeChange}
                        color={ENVELOPE_COLORS[envelope.id]}
                    />
                </SectionPanel>
            ))}

            {/* NONE-mode envelopes as full section panels */}
            {nonGraphEnvelopes.map((env) => (
                <SectionPanel key={env.id} title={env.label} showSettings showMore>
                    <KnobGrid
                        params={env.params}
                        values={envelopeValues}
                        onChange={onEnvelopeChange}
                        color={ENVELOPE_COLORS[env.id]}
                    />
                </SectionPanel>
            ))}

            {/* Macro params as OUTPUT section */}
            {macros.length > 0 && (
                <SectionPanel title="OUTPUT" showSettings showMore>
                    <KnobGrid
                        params={macros}
                        values={macroValues}
                        onChange={onMacroChange}
                        color="#10B981"
                    />
                </SectionPanel>
            )}
        </div>
    );
};
