"use client";

import React from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import clsx from "clsx";

interface Props {
  lastFeedbackLabel: number | null;
  onSubmitFeedback: (label: number) => void;
}

export const FeedbackControls: React.FC<Props> = ({ lastFeedbackLabel, onSubmitFeedback }) => (
  <div className="flex gap-1">
    <button
      onClick={() => onSubmitFeedback(0)}
      disabled={lastFeedbackLabel !== null}
      className={clsx(
        "p-2 rounded hover:bg-neutral-800 transition-colors",
        lastFeedbackLabel === 0 ? "text-red-500" : "text-neutral-500"
      )}
      title="Bad sound"
    >
      <ThumbsDown size={16} />
    </button>
    <button
      onClick={() => onSubmitFeedback(1)}
      disabled={lastFeedbackLabel !== null}
      className={clsx(
        "p-2 rounded hover:bg-neutral-800 transition-colors",
        lastFeedbackLabel === 1 ? "text-emerald-500" : "text-neutral-500"
      )}
      title="Good sound"
    >
      <ThumbsUp size={16} />
    </button>
  </div>
);
