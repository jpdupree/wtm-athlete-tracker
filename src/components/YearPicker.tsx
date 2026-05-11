"use client";

import { useSelectedYear } from "@/hooks/useSelectedYear";
import { YEARS } from "@/lib/years";

// Compact pill row showing each available year. Active year tinted with
// the brand accent; years without data wired up render dimmer so the
// picker still works but the user knows what to expect.
export function YearPicker() {
  const [selected, setSelected] = useSelectedYear();

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Race year">
      {YEARS.map((y) => {
        const active = y.year === selected;
        return (
          <button
            key={y.year}
            type="button"
            onClick={() => setSelected(y.year)}
            aria-pressed={active}
            title={`${y.year} · ${y.venue}${y.hasData ? "" : " (no data wired up)"}`}
            className="rounded-full px-2 py-0.5 text-[11px] tabular-nums uppercase tracking-wider transition-colors"
            style={
              active
                ? {
                    border: "1px solid var(--wtm-accent)",
                    color: "var(--wtm-accent)",
                    background: "var(--wtm-accent-dim)",
                  }
                : {
                    border: "1px solid var(--wtm-border)",
                    opacity: y.hasData ? 0.7 : 0.45,
                  }
            }
          >
            {y.year}
          </button>
        );
      })}
    </div>
  );
}
