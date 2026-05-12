"use client";

import { createContext, useContext } from "react";
import { useFeed, type UseFeedResult } from "@/hooks/useFeed";
import { useSelectedYear } from "@/hooks/useSelectedYear";

const OverallContext = createContext<UseFeedResult | null>(null);

export function FeedProvider({ children }: { children: React.ReactNode }) {
  // Year is driven by the picker. When it changes useFeed re-fetches.
  const [year] = useSelectedYear();
  const overall = useFeed("overall", year);
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
