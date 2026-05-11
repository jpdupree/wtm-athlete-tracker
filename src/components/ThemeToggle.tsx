"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeToggle() {
  // Start undefined so SSR markup doesn't disagree with the
  // theme-init script's choice; populate on mount.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("wtm-theme", next);
    } catch {
      /* private mode, ignore */
    }
  }

  const isLight = theme === "light";
  const label = `Switch to ${isLight ? "dark" : "light"} theme`;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors"
      style={{
        border: "1px solid var(--wtm-border)",
        background: "var(--wtm-surface)",
        color: "var(--wtm-fg)",
      }}
    >
      {/* Same icon space in both states; opacity carries the meaning so
          there's no layout shift while the user's choice loads. */}
      {theme === null ? (
        <span className="opacity-30" aria-hidden>
          ◐
        </span>
      ) : isLight ? (
        // Moon (offer dark)
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path
            d="M16 11.5A6 6 0 1 1 8.5 4a6.5 6.5 0 0 0 7.5 7.5z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        // Sun (offer light)
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
          <circle cx="10" cy="10" r="3.2" stroke="currentColor" strokeWidth="1.5" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <line
              key={deg}
              x1="10"
              y1="2.2"
              x2="10"
              y2="4.4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              transform={`rotate(${deg} 10 10)`}
            />
          ))}
        </svg>
      )}
    </button>
  );
}
