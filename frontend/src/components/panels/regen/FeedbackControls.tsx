"use client";

import React from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import clsx from "clsx";

interface Props {
  feedbackSent: number | null;
  onSubmitFeedback: (label: number) => void;
}

export const FeedbackControls: React.FC<Props> = ({ feedbackSent, onSubmitFeedback }) => (
  <div className="flex gap-1">
    <button
      onClick={() => onSubmitFeedback(0)}
      disabled={feedbackSent !== null}
      className={clsx(
        "p-2 rounded hover:bg-neutral-800 transition-colors",
        feedbackSent === 0 ? "text-red-500" : "text-neutral-500"
      )}
      title="Bad sound"
    >
      <ThumbsDown size={16} />
    </button>
    <button
      onClick={() => onSubmitFeedback(1)}
      disabled={feedbackSent !== null}
      className={clsx(
        "p-2 rounded hover:bg-neutral-800 transition-colors",
        feedbackSent === 1 ? "text-emerald-500" : "text-neutral-500"
      )}
      title="Good sound"
    >
      <ThumbsUp size={16} />
    </button>
  </div>
);
