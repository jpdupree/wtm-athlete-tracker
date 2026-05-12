"use client";

import { useEffect, useState } from "react";
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
  const hasData = configFor(year).hasData;

  useEffect(() => {
    // PER-RUN cancellation flag — captured by every closure inside this
    // effect invocation. A shared useRef would get reset by the NEXT
    // effect's setup before an in-flight fetch from the previous year
    // resolves, letting an older year's response stomp on newer state
    // (seen in the wild as the "Add athlete" list briefly flipping to
    // 2025 results when viewing a different year).
    let cancelled = false;
    // Aborts the in-flight network request when the year changes mid-
    // request, so we don't even wait for it to come back.
    const ac = new AbortController();
    setData(null);
    setError(null);
    if (!hasData) {
      setLoading(false);
      return () => {
        cancelled = true;
        ac.abort();
      };
    }
    setLoading(true);
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const res = await fetch(
          `/api/results/${slice}?year=${year}`,
          { cache: "no-store", signal: ac.signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as FeedResponse;
        if (cancelled) return;
        setData(json);
        setError(null);
      } catch (e) {
        // AbortError from a year-change is expected; don't surface it
        // as a real error to the UI.
        if (cancelled || (e as Error).name === "AbortError") return;
        setError(e as Error);
      } finally {
        if (cancelled) return;
        setLoading(false);
        if (typeof document !== "undefined" && !document.hidden) {
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
      } else if (!timer && !cancelled) {
        tick();
      }
    }

    document.addEventListener("visibilitychange", onVis);
    tick();

    return () => {
      cancelled = true;
      ac.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [slice, year, hasData]);

  return { data, error, loading };
}
