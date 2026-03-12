/**
 * SectionPanel — bordered section container for VST-style parameter grouping.
 */

"use client";

import React from "react";

interface SectionPanelProps {
  title: string;
  children: React.ReactNode;
  color?: string;
}

export const SectionPanel: React.FC<SectionPanelProps> = ({
  title,
  children,
  color = "#10B981",
}) => (
  <div className="flex flex-col border border-neutral-800 rounded-lg bg-neutral-950 overflow-hidden">
    <div
      className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border-b border-neutral-800"
      style={{ color }}
    >
      {title}
    </div>
    <div className="p-3 flex flex-wrap gap-3 items-start justify-center">
      {children}
    </div>
  </div>
);
