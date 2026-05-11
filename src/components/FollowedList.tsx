"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";

export function FollowedList() {
  const followed = useLiveQuery(
    () => db.followed.orderBy("addedAt").toArray(),
    [],
  );

  if (followed === undefined) {
    return <p className="text-sm opacity-50">Loading…</p>;
  }

  if (followed.length === 0) {
    return (
      <section className="rounded-lg border border-current/20 p-6 text-center space-y-3">
        <p className="text-sm">No athletes followed yet.</p>
        <Link
          href="/add"
          className="inline-flex items-center justify-center rounded-md border border-current/40 px-4 py-2 text-sm font-medium"
        >
          Add athlete
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <ul className="divide-y divide-current/10 rounded-lg border border-current/20">
        {followed.map((a) => (
          <li key={a.bib} className="flex items-center justify-between px-4 py-3">
            <Link href={`/a/${a.bib}`} className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{a.name}</p>
              <p className="truncate text-xs opacity-60">
                #{a.bib}
                {a.gender && ` · ${a.gender}`}
                {a.team && ` · ${a.team}`}
                {a.goalMiles != null && ` · goal ${a.goalMiles}mi`}
              </p>
            </Link>
            <button
              onClick={() => {
                if (confirm(`Remove ${a.name} from followed?`)) {
                  void db.followed.delete(a.bib);
                }
              }}
              aria-label={`Remove ${a.name}`}
              className="ml-3 shrink-0 rounded-md border border-current/20 px-2 py-1 text-xs opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <Link
        href="/add"
        className="block rounded-md border border-current/30 px-4 py-2 text-center text-sm font-medium"
      >
        Add another athlete
      </Link>
    </section>
  );
}
