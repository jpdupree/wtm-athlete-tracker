"use client";

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { syncBibLaps, syncBibLapsFromPassings } from "@/lib/lapSync";
import type { PassingsResponse } from "@/lib/types";
import { useOverallFeed } from "./FeedProvider";

export function LapSyncProvider({ children }: { children: React.ReactNode }) {
  const followed = useLiveQuery(() => db.followed.toArray(), []);
  const { data } = useOverallFeed();

  useEffect(() => {
    if (!data || !followed?.length) return;
    const followedBibs = new Set(followed.map((a) => a.bib));
    void Promise.all(
      data.rows.filter((r) => followedBibs.has(r.bib)).map((r) => syncBibLaps(r)),
    );
  }, [data, followed]);

  // Passings sync — full per-lap history. Runs on mount and any time the
  // overall poll fires. Fan out in parallel so adding more followed athletes
  // doesn't multiply latency: 10 sequential round trips over a slow tunnel
  // can stall the UI for several seconds.
  useEffect(() => {
    if (!followed?.length) return;
    let cancelled = false;
    void Promise.all(
      followed.map(async (a) => {
        if (cancelled) return;
        try {
          const res = await fetch(`/api/passings/${a.bib}`, { cache: "no-store" });
          if (!res.ok) return;
          const body = (await res.json()) as PassingsResponse;
          if (cancelled) return;
          await syncBibLapsFromPassings(a.bib, body.passings);
        } catch {
          /* swallow — best-effort */
        }
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [followed, data?.fetchedAt]);

  return <>{children}</>;
}
