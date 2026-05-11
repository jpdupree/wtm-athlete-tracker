"use client";

import { db } from "@/lib/db";

// Pause / resume the periodic feed sync for an athlete without removing
// them. Used after a DNF where the user wants to keep history on the page
// but stop the every-15s round trip.
export function PauseToggle({ bib, paused }: { bib: number; paused: boolean }) {
  const label = paused ? "Resume" : "Pause";
  const title = paused
    ? "Resume tracking — pulls live updates again"
    : "Pause tracking — keeps current history, skips future syncs";

  return (
    <button
      type="button"
      onClick={() => void db.followed.update(bib, { paused: !paused })}
      aria-label={label}
      title={title}
      className="print-hide inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs uppercase tracking-wider font-semibold transition-colors"
      style={{
        border: `1px solid ${paused ? "var(--wtm-accent)" : "var(--wtm-border-strong)"}`,
        background: paused ? "var(--wtm-accent-dim)" : "var(--wtm-surface)",
        color: paused ? "var(--wtm-accent)" : "var(--wtm-fg)",
      }}
    >
      {paused ? (
        <svg
          width="13"
          height="13"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <polygon points="6,4 16,10 6,16" />
        </svg>
      ) : (
        <svg
          width="13"
          height="13"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <rect x="5" y="4" width="3.5" height="12" />
          <rect x="11.5" y="4" width="3.5" height="12" />
        </svg>
      )}
      {label}
    </button>
  );
}
