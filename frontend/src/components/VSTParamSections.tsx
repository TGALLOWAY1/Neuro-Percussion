/**
 * VSTParamSections — auto-generates SectionPanel + Knob grids from spec.
 * Shows non-canvas envelopes (CLICK, NOISE, BODY, etc.) and macros as knob sections.
 */

"use client";

import React from "react";
import { usePercussionStore } from "@/store/usePercussionStore";
import { getEnvelopeSpec } from "@/audio/params";
import { SectionPanel } from "./SectionPanel";
import { Knob } from "./Knob";

/** Section colors by envelope type */
const SECTION_COLORS: Record<string, string> = {
  pitch: "#F59E0B",   // amber
  click: "#F59E0B",   // amber
  body: "#8B5CF6",    // violet
  noise: "#06B6D4",   // cyan
  snap: "#EF4444",    // red
  metal: "#D946EF",   // fuchsia
  stereo: "#3B82F6",  // blue
  macros: "#10B981",  // emerald
};

export const VSTParamSections: React.FC = () => {
  const instrument = usePercussionStore((s) => s.instrument);
  const envelopeParams = usePercussionStore((s) => s.envelopeParams);
  const params = usePercussionStore((s) => s.params);
  const updateEnvelopeParam = usePercussionStore((s) => s.updateEnvelopeParam);
  const updateParam = usePercussionStore((s) => s.updateParam);

  const spec = getEnvelopeSpec(instrument);

  // Only "amp" is shown as a Bezier canvas; everything else becomes knob sections
  const knobEnvelopes = spec.envelopes.filter((e) => e.id !== "amp");

  // Macros
  const macros = spec.macroParams ?? [];

  // Count total sections to determine grid columns
  const totalSections = knobEnvelopes.length + (macros.length > 0 ? 1 : 0);
  const gridCols =
    totalSections <= 2
      ? "grid-cols-1 sm:grid-cols-2"
      : totalSections <= 3
        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";

  if (totalSections === 0) return null;

  return (
    <div className={`grid ${gridCols} gap-2`}>
      {/* Envelope parameter sections */}
      {knobEnvelopes.map((env) => (
        <SectionPanel
          key={env.id}
          title={env.label}
          color={SECTION_COLORS[env.id] ?? "#10B981"}
        >
          {env.params.map((p) => (
            <Knob
              key={p.id}
              label={p.label}
              value={envelopeParams[p.id] ?? p.default}
              min={p.min}
              max={p.max}
              step={p.step}
              unit={p.unit}
              onChange={(v) => updateEnvelopeParam(p.id, v)}
              size={44}
              color={SECTION_COLORS[env.id] ?? "#10B981"}
            />
          ))}
        </SectionPanel>
      ))}

      {/* Macro parameters section */}
      {macros.length > 0 && (
        <SectionPanel title="OUTPUT" color={SECTION_COLORS.macros}>
          {macros.map((p) => (
            <Knob
              key={p.id}
              label={p.label}
              value={params[p.id] ?? p.default}
              min={p.min}
              max={p.max}
              step={p.step}
              unit={p.unit}
              onChange={(v) => updateParam(p.id, v)}
              size={44}
              color={SECTION_COLORS.macros}
            />
          ))}
        </SectionPanel>
      )}
    </div>
  );
};
