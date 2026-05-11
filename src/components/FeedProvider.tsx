"use client";

import { createContext, useContext } from "react";
import { useFeed, type UseFeedResult } from "@/hooks/useFeed";

const OverallContext = createContext<UseFeedResult | null>(null);

export function FeedProvider({ children }: { children: React.ReactNode }) {
  const overall = useFeed("overall");
  return (
    <OverallContext.Provider value={overall}>{children}</OverallContext.Provider>
  );
}

export function useOverallFeed(): UseFeedResult {
  const v = useContext(OverallContext);
  if (!v) {
    throw new Error("useOverallFeed must be used inside FeedProvider");
  }
  return v;
}
