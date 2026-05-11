"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedResponse, Slice } from "@/lib/types";

const POLL_MS = 15_000;

export type UseFeedResult = {
  data: FeedResponse | null;
  error: Error | null;
  loading: boolean;
};

export function useFeed(slice: Slice): UseFeedResult {
  const [data, setData] = useState<FeedResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const aborted = useRef(false);

  useEffect(() => {
    aborted.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const res = await fetch(`/api/results/${slice}`, { cache: "no-store" });
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
  }, [slice]);

  return { data, error, loading };
}
