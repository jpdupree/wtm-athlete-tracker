"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFeed } from "@/hooks/useFeed";
import { fmtAge, fmtSec } from "@/lib/format";

export default function AddAthletePage() {
  const { data, error, loading } = useFeed("overall");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    if (!term) return data.rows;
    const isNumeric = /^\d+$/.test(term);
    return data.rows.filter((r) =>
      isNumeric ? String(r.bib).startsWith(term) : r.name.toLowerCase().includes(term),
    );
  }, [data, q]);

  return (
    <main className="mx-auto max-w-md px-4 py-6 space-y-4">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm opacity-70">← Home</Link>
        <span className="text-xs opacity-50">
          {data
            ? `${data.rows.length} athletes · updated ${fmtAge(data.ageMs)}`
            : loading
              ? "Loading…"
              : ""}
        </span>
      </header>

      <h1 className="text-2xl font-bold">Add athlete</h1>

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
        {rows.map((r) => (
          <li key={r.bib} className="flex items-center justify-between py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{r.name}</p>
              <p className="truncate text-xs opacity-60">
                #{r.bib} · {r.nation} · {r.category}
                {r.laps > 0 && ` · ${r.laps} laps · last ${fmtSec(r.lastLapSec)}`}
              </p>
            </div>
            <button
              disabled
              className="ml-3 shrink-0 rounded-md border border-current/30 px-3 py-1 text-xs opacity-50"
              title="Wired in week 3"
            >
              Follow
            </button>
          </li>
        ))}
        {data && rows.length === 0 && (
          <li className="py-8 text-center text-sm opacity-60">
            No matches. (Manual add lands week 3.)
          </li>
        )}
      </ul>
    </main>
  );
}
