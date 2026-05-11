"use client";

import Link from "next/link";
import { use } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";

export default function AthleteDetailPage({
  params,
}: {
  params: Promise<{ bib: string }>;
}) {
  const { bib: bibParam } = use(params);
  const bib = parseInt(bibParam, 10);
  const athlete = useLiveQuery(() => db.followed.get(bib), [bib]);

  if (athlete === undefined) {
    return <p className="p-6 text-sm opacity-50">Loading…</p>;
  }

  if (!athlete) {
    return (
      <main className="mx-auto max-w-md px-4 py-6 space-y-3">
        <Link href="/" className="text-sm opacity-70">← Home</Link>
        <p className="text-sm">Bib #{bib} is not followed.</p>
        <Link
          href="/add"
          className="inline-flex items-center justify-center rounded-md border border-current/40 px-4 py-2 text-sm font-medium"
        >
          Add athlete
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-6 space-y-4">
      <Link href="/" className="text-sm opacity-70">← Home</Link>
      <header>
        <h1 className="text-2xl font-bold">{athlete.name}</h1>
        <p className="text-sm opacity-60">
          #{athlete.bib}
          {athlete.gender && ` · ${athlete.gender}`}
          {athlete.team && ` · ${athlete.team}`}
        </p>
      </header>

      <p className="rounded-lg border border-dashed border-current/30 p-6 text-center text-sm opacity-70">
        Detail page (laps, pits, fuel, notes, countdowns, map) lands week 4.
      </p>
    </main>
  );
}
