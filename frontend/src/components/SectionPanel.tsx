"use client";

import React from "react";
import { Settings, MoreHorizontal } from "lucide-react";

interface SectionPanelProps {
    title: string;
    children: React.ReactNode;
    showSettings?: boolean;
    showMore?: boolean;
}

export const SectionPanel: React.FC<SectionPanelProps> = ({
    title,
    children,
    showSettings = false,
    showMore = false,
}) => {
    return (
        <div className="flex flex-col bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden">
            {/* Title bar */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
                <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                    {title}
                </span>
                <div className="flex items-center gap-1">
                    {showSettings && (
                        <button className="p-1 text-neutral-600 hover:text-neutral-400 transition-colors">
                            <Settings size={12} />
                        </button>
                    )}
                    {showMore && (
                        <button className="p-1 text-neutral-600 hover:text-neutral-400 transition-colors">
                            <MoreHorizontal size={12} />
                        </button>
                    )}
                </div>
            </div>
            {/* Content */}
            <div className="p-3">
                {children}
            </div>
        </div>
    );
};
