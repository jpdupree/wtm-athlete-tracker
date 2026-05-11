"use client";

import { useNow } from "@/hooks/useNow";
import { fmtCountdown, fmtVenueClock } from "@/lib/format";
import { LAST_LAP_START_CUTOFF, RACE_END, RACE_START } from "@/lib/race";

export function Countdowns() {
  const now = useNow(1000);

  const toStart = RACE_START.getTime() - now;
  const toCutoff = LAST_LAP_START_CUTOFF.getTime() - now;
  const toEnd = RACE_END.getTime() - now;

  if (toStart > 0) {
    return (
      <Card label="Race starts" main={fmtCountdown(toStart)} sub={fmtVenueClock(RACE_START)} />
    );
  }
  if (toCutoff > 0) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Card label="Cutoff" main={fmtCountdown(toCutoff)} sub="No new laps after" />
        <Card label="Race ends" main={fmtCountdown(toEnd)} sub={fmtVenueClock(RACE_END)} />
      </div>
    );
  }
  if (toEnd > 0) {
    return (
      <Card
        label="Race ends"
        main={fmtCountdown(toEnd)}
        sub="Cutoff passed — finish your current lap"
      />
    );
  }
  return <Card label="Race" main="Finished" sub={fmtVenueClock(RACE_END)} />;
}

function Card({ label, main, sub }: { label: string; main: string; sub: string }) {
  return (
    <div className="rounded-lg border border-current/20 px-4 py-3">
      <p className="text-xs uppercase tracking-wide opacity-60">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{main}</p>
      <p className="text-xs opacity-60">{sub}</p>
    </div>
  );
}
