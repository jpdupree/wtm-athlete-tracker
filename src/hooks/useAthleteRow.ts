"use client";

import { useMemo } from "react";
import { useOverallFeed } from "@/components/FeedProvider";
import type { Athlete } from "@/lib/types";

export type UseAthleteRowResult = {
  row: Athlete | null;
  loading: boolean;
  error: Error | null;
  ageMs: number;
};

export function useAthleteRow(bib: number): UseAthleteRowResult {
  const { data, loading, error } = useOverallFeed();
  const row = useMemo(() => {
    if (!data) return null;
    return data.rows.find((r) => r.bib === bib) ?? null;
  }, [data, bib]);
  return { row, loading, error, ageMs: data?.ageMs ?? 0 };
}
