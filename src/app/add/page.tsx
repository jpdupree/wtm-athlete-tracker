"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useOverallFeed } from "@/components/FeedProvider";
import { useFeed } from "@/hooks/useFeed";
import { useSelectedYear } from "@/hooks/useSelectedYear";
import { fmtAge, fmtSec } from "@/lib/format";
import { FollowButton } from "@/components/FollowButton";
import { ManualAddForm } from "@/components/ManualAddForm";

export default function AddAthletePage() {
  const [year] = useSelectedYear();
  const { data, error, loading } = useOverallFeed();
  // Teams aren't in the overall slice (different ranking semantics), but
  // for the picker we want everything followable in one list.
  const teamsFeed = useFeed("teams", year);
  const [q, setQ] = useState("");
  const [manualOpen, setManualOpen] = useState(false);

  const allRows = useMemo(() => {
    const ind = data?.rows ?? [];
    const teams = teamsFeed.data?.rows ?? [];
    return [...ind, ...teams];
  }, [data, teamsFeed.data]);

  const rows = useMemo(() => {
    if (allRows.length === 0) return [];
    const term = q.trim().toLowerCase();
    if (!term) return allRows;
    const isNumeric = /^\d+$/.test(term);
    return allRows.filter((r) =>
      isNumeric ? String(r.bib).startsWith(term) : r.name.toLowerCase().includes(term),
    );
  }, [allRows, q]);

  // Search fallback only when the user has typed AND we're not already
  // showing the explicit manual panel from the top button.
  const showManualFromSearch =
    !manualOpen && (!!data || !!teamsFeed.data) && q.trim() !== "" && rows.length === 0;

  return (
    <main className="mx-auto max-w-md px-4 py-6 space-y-4">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs uppercase tracking-wider opacity-60 hover:opacity-100"
        >
          <span style={{ color: "var(--wtm-accent)" }}>←</span> Home
        </Link>
        <span className="text-xs opacity-50">
          {allRows.length > 0
            ? `${allRows.length} entries · updated ${fmtAge(data?.ageMs ?? 0)}`
            : loading
              ? "Loading…"
              : ""}
        </span>
      </header>

      <div className="flex items-center justify-between gap-3">
        <h1 className="wtm-display text-3xl leading-none">Add athlete</h1>
        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          aria-expanded={manualOpen}
          aria-controls="manual-add-panel"
          className="rounded-md px-3 py-1.5 text-xs uppercase tracking-wider font-semibold transition-colors"
          style={{
            border: "1px solid var(--wtm-accent)",
            color: manualOpen ? "var(--wtm-fg)" : "var(--wtm-accent)",
            background: manualOpen ? "var(--wtm-accent-dim)" : "transparent",
          }}
        >
          {manualOpen ? "Close" : "+ Manual"}
        </button>
      </div>

      {manualOpen && (
        <div id="manual-add-panel">
          <ManualAddForm />
        </div>
      )}

      <input
        type="search"
        placeholder="Search name or bib"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full rounded-md border border-current/20 bg-transparent px-3 py-2 text-sm"
        inputMode="search"
        autoFocus
      />

      {error && (
        <p className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm">
          {error.message}
        </p>
      )}

      <ul className="divide-y divide-current/10">
        {rows.slice(0, 100).map((r) => (
          <li key={r.bib} className="flex items-center justify-between py-2 gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium flex items-center gap-1.5">
                {r.category === "Team" && (
                  <span
                    className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                    style={{
                      background: "var(--wtm-accent-dim)",
                      color: "var(--wtm-accent)",
                    }}
                  >
                    Team
                  </span>
                )}
                <span className="truncate">{r.name}</span>
              </p>
              <p className="truncate text-xs opacity-60">
                #{r.bib}
                {r.nation && ` · ${r.nation}`}
                {r.category !== "Team" && ` · ${r.category}`}
                {r.laps > 0 && ` · ${r.laps} laps`}
                {r.laps > 0 && r.lastLapSec != null && ` · last ${fmtSec(r.lastLapSec)}`}
              </p>
            </div>
            <FollowButton row={r} />
          </li>
        ))}
      </ul>

      {data && rows.length > 100 && (
        <p className="text-center text-xs opacity-50">
          Showing first 100 of {rows.length}. Refine your search to see more.
        </p>
      )}

      {showManualFromSearch && (
        <>
          <p className="text-center text-sm opacity-60">
            No matches for &ldquo;{q}&rdquo;.
          </p>
          <ManualAddForm initialName={/^\d+$/.test(q.trim()) ? "" : q.trim()} />
        </>
      )}
    </main>
  );
}
