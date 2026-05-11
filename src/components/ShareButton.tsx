"use client";

import { useState } from "react";

// Share the current page URL via the Web Share API on phones, or fall back
// to the clipboard on desktop. Just-the-URL is enough — any browser opening
// it lands on the athlete detail page (no auth, public route).
export function ShareButton({ name, bib }: { name: string; bib: number }) {
  const [feedback, setFeedback] = useState<"idle" | "copied" | "failed">("idle");

  async function handleShare() {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    const title = `${name} #${bib} — WTM Tracker`;
    const text = `Follow ${name} (bib #${bib}) at World's Toughest Mudder.`;

    // navigator.share is mobile-first; desktop browsers (except some)
    // don't expose it.
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        /* user-cancelled or share failed; try clipboard */
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setFeedback("copied");
      setTimeout(() => setFeedback("idle"), 1800);
    } catch {
      setFeedback("failed");
      setTimeout(() => setFeedback("idle"), 1800);
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={`Share link to ${name}'s page`}
      className="print-hide inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs uppercase tracking-wider font-semibold transition-colors"
      style={{
        border: "1px solid var(--wtm-border-strong)",
        background: "var(--wtm-surface)",
        color: "var(--wtm-fg)",
      }}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="5" cy="10" r="2.2" />
        <circle cx="15" cy="5" r="2.2" />
        <circle cx="15" cy="15" r="2.2" />
        <line x1="6.8" y1="9" x2="13.3" y2="6" />
        <line x1="6.8" y1="11" x2="13.3" y2="14" />
      </svg>
      {feedback === "copied" ? "Copied" : feedback === "failed" ? "Failed" : "Share"}
    </button>
  );
}
