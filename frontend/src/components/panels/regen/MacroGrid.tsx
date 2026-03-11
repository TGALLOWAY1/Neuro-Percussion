"use client";

import React from "react";
import { MacroSlider } from "../../MacroSlider";

interface MacroParam {
  id: string;
  label: string;
  min: number;
  max: number;
  default: number;
}

interface Props {
  macroParams: MacroParam[];
  values: Record<string, number>;
  onUpdateParam: (key: string, value: number) => void;
}

export const MacroGrid: React.FC<Props> = ({ macroParams, values, onUpdateParam }) => {
  if (macroParams.length === 0) return null;
  return (
    <div className="grid grid-cols-4 gap-4">
      {macroParams.map((p) => (
        <MacroSlider
          key={p.id}
          label={p.label}
          value={values[p.id] ?? p.default}
          min={p.min}
          max={p.max}
          onChange={(v) => onUpdateParam(p.id, v)}
        />
      ))}
    </div>
  );
};
