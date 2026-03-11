"use client";

import React, { useEffect } from "react";
import { usePercussionStore } from "@/store/usePercussionStore";
import { X } from "lucide-react";

export const ErrorToast: React.FC = () => {
  const error = usePercussionStore((s) => s.error);
  const clearError = usePercussionStore((s) => s.clearError);

  // Auto-dismiss after 6 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(clearError, 6000);
    return () => clearTimeout(timer);
  }, [error, clearError]);

  if (!error) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-red-950 border border-red-800 text-red-200 px-4 py-3 rounded-lg shadow-xl max-w-sm animate-in fade-in slide-in-from-bottom-2"
    >
      <span className="text-sm flex-1">{error}</span>
      <button
        onClick={clearError}
        className="text-red-400 hover:text-red-200 transition-colors p-0.5"
        aria-label="Dismiss error"
      >
        <X size={14} />
      </button>
    </div>
  );
};
