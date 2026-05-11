"use client";

import { useEffect, useState } from "react";
import { RACE_START, SIM_RACE_ELAPSED_SEC } from "@/lib/race";

function simOrReal(): number {
  if (SIM_RACE_ELAPSED_SEC != null) {
    return RACE_START.getTime() + SIM_RACE_ELAPSED_SEC * 1000;
  }
  return Date.now();
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(simOrReal);
  useEffect(() => {
    // When the sim clock is frozen, no need to tick.
    if (SIM_RACE_ELAPSED_SEC != null) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
