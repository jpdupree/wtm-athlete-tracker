"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_YEAR, YEARS } from "@/lib/years";

const STORAGE_KEY = "wtm-year-v1";
const EVENT_NAME = "wtm-year-change";

function validYear(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return YEARS.some((y) => y.year === n) ? n : null;
}

function readStored(): number {
  if (typeof window === "undefined") return DEFAULT_YEAR;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw == null ? null : validYear(parseInt(raw, 10));
    return parsed ?? DEFAULT_YEAR;
  } catch {
    return DEFAULT_YEAR;
  }
}

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  // Same-tab updates come through the custom event; cross-tab updates come
  // through the storage event. We listen for both so any consumer in the
  // tree re-renders when the selected year changes.
  window.addEventListener(EVENT_NAME, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT_NAME, callback);
    window.removeEventListener("storage", callback);
  };
}

function getServerSnapshot(): number {
  return DEFAULT_YEAR;
}

// Client-side selected race year. Backed by localStorage so the choice
// survives reloads, broadcast via a custom event so all consumers stay in
// sync within the same tab. useSyncExternalStore reads the stored value
// on the very first client render, avoiding the "initial DEFAULT_YEAR
// then snap to stored value" flicker that triggered stale queries.
export function useSelectedYear(): [number, (y: number) => void] {
  const year = useSyncExternalStore(subscribe, readStored, getServerSnapshot);

  const setYear = useCallback((next: number) => {
    const v = validYear(next);
    if (v == null) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(v));
    } catch {
      /* private mode */
    }
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: v }));
  }, []);

  return [year, setYear];
}
