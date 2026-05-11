"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_YEAR, YEARS } from "@/lib/years";

const STORAGE_KEY = "wtm-year-v1";
const EVENT_NAME = "wtm-year-change";

function validYear(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return YEARS.some((y) => y.year === n) ? n : null;
}

// Client-side selected race year. localStorage-backed so the choice
// survives reloads; also broadcasts a custom event so any other mounted
// consumer of this hook stays in sync without a full reload.
export function useSelectedYear(): [number, (y: number) => void] {
  const [year, setYearState] = useState<number>(DEFAULT_YEAR);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw == null ? null : validYear(parseInt(raw, 10));
      if (parsed != null) setYearState(parsed);
    } catch {
      /* private mode */
    }
    const handler = (e: Event) => {
      const ce = e as CustomEvent<number>;
      if (typeof ce.detail === "number") setYearState(ce.detail);
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  const setYear = useCallback((next: number) => {
    const v = validYear(next);
    if (v == null) return;
    setYearState(v);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(v));
    } catch {
      /* */
    }
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: v }));
  }, []);

  return [year, setYear];
}
