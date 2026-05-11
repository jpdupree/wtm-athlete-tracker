"use client";

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { syncBibLaps } from "@/lib/lapSync";
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

  return <>{children}</>;
}
