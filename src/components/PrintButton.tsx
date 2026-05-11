"use client";

// Invokes the browser print dialog for the current page. The print
// stylesheet in globals.css forces a clean light layout, expands all
// collapsed lap cards, and hides chrome marked .print-hide. The button
// itself also carries .print-hide so it doesn't show up on paper.
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      aria-label="Print this athlete's race card"
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
        <path d="M6 4h8v4H6z" />
        <path d="M4 8h12a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2v-3H6v3H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
        <path d="M6 12h8v4H6z" />
      </svg>
      Print
    </button>
  );
}
