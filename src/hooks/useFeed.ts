"use client";

import { useEffect, useRef, useState } from "react";
import { configFor } from "@/lib/years";
import type { FeedResponse, Slice } from "@/lib/types";

const POLL_MS = 15_000;

export type UseFeedResult = {
  data: FeedResponse | null;
  error: Error | null;
  loading: boolean;
};

// Polls /api/results/<slice>?year=<year>. When the configured year hasn't
// had data wired up, this returns {data:null,loading:false,error:null}
// immediately — no network traffic, no spinner.
export function useFeed(slice: Slice, year: number): UseFeedResult {
  const [data, setData] = useState<FeedResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const aborted = useRef(false);
  const hasData = configFor(year).hasData;

  useEffect(() => {
    aborted.current = false;
    // Clear any stale data from the previous year/slice combo so
    // consumers don't briefly see another year's rows during the switch.
    setData(null);
    setError(null);
    if (!hasData) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const res = await fetch(
          `/api/results/${slice}?year=${year}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as FeedResponse;
        if (aborted.current) return;
        setData(json);
        setError(null);
      } catch (e) {
        if (!aborted.current) setError(e as Error);
      } finally {
        if (!aborted.current) setLoading(false);
        if (!aborted.current && typeof document !== "undefined" && !document.hidden) {
          timer = setTimeout(tick, POLL_MS);
        }
      }
    }

    function onVis() {
      if (document.hidden) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      } else if (!timer) {
        tick();
      }
    }

    document.addEventListener("visibilitychange", onVis);
    tick();

    return () => {
      aborted.current = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [slice, year, hasData]);

  return { data, error, loading };
}
