"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useOverallFeed } from "@/components/FeedProvider";
import { fmtAge, fmtSec } from "@/lib/format";
import { FollowButton } from "@/components/FollowButton";
import { ManualAddForm } from "@/components/ManualAddForm";

export default function AddAthletePage() {
  const { data, error, loading } = useOverallFeed();
  const [q, setQ] = useState("");
  const [manualOpen, setManualOpen] = useState(false);

  const rows = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    if (!term) return data.rows;
    const isNumeric = /^\d+$/.test(term);
    return data.rows.filter((r) =>
      isNumeric ? String(r.bib).startsWith(term) : r.name.toLowerCase().includes(term),
    );
  }, [data, q]);

  // Search fallback only when the user has typed AND we're not already
  // showing the explicit manual panel from the top button.
  const showManualFromSearch =
    !manualOpen && !!data && q.trim() !== "" && rows.length === 0;

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
          {data
            ? `${data.rows.length} athletes · updated ${fmtAge(data.ageMs)}`
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
          <li key={r.bib} className="flex items-center justify-between py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{r.name}</p>
              <p className="truncate text-xs opacity-60">
                #{r.bib} · {r.nation} · {r.category}
                {r.laps > 0 && ` · ${r.laps} laps · last ${fmtSec(r.lastLapSec)}`}
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
