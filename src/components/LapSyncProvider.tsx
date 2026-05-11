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
    // Paused athletes skip sync — their data stays as it is.
    const activeBibs = new Set(
      followed.filter((a) => !a.paused).map((a) => a.bib),
    );
    void Promise.all(
      data.rows.filter((r) => activeBibs.has(r.bib)).map((r) => syncBibLaps(r)),
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
      followed
        .filter((a) => !a.paused)
        .map(async (a) => {
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

  // Warm the SW cache with each followed athlete's page so offline
  // navigation to /a/<bib> works for everyone on the list — without
  // this, a user who never tapped into a specific athlete while online
  // gets "site can't be reached" when they try offline.
  useEffect(() => {
    if (!followed?.length) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    for (const a of followed) {
      if (a.paused) continue;
      // The SW intercepts and caches successful responses; failures are
      // swallowed because this is a best-effort warm-up.
      void fetch(`/a/${a.bib}`, { credentials: "same-origin" }).catch(() => {});
    }
  }, [followed]);

  return <>{children}</>;
}
