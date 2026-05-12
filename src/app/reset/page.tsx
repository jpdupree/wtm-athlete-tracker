"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { resetLocalDb } from "@/lib/db";

// Escape hatch for when a schema mismatch (or any other local-DB problem)
// has broken the app on a given device. Wipes IndexedDB, then offers a
// link back home. Reached by typing /reset onto the URL.
//
// Loses every locally-stored follow, lap, fuel log, and note on this
// device — server-side feed data is untouched, so re-following the same
// bibs restores live data immediately.
export default function ResetPage() {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (state !== "working") return;
    let cancelled = false;
    (async () => {
      try {
        await resetLocalDb();
        if (!cancelled) setState("done");
      } catch (e) {
        if (!cancelled) {
          setErr((e as Error).message || "Unknown error");
          setState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state]);

  return (
    <main className="mx-auto max-w-md px-4 py-10 space-y-4">
      <h1 className="wtm-display text-3xl leading-none">Reset local data</h1>

      {state === "idle" && (
        <>
          <p className="text-sm opacity-80 leading-snug">
            Wipes the local IndexedDB on this device — every followed
            athlete, lap entry, fuel log, and note. Use this if the app
            is throwing a client-side error after a schema change.
          </p>
          <p className="text-sm opacity-80 leading-snug">
            Server-side race data is unaffected. Re-following the same
            bibs restores live tracking immediately.
          </p>
          <button
            type="button"
            onClick={() => setState("working")}
            className="block w-full rounded-md px-4 py-3 text-center text-sm font-semibold uppercase tracking-wider"
            style={{
              border: "1px solid var(--wtm-accent)",
              color: "var(--wtm-accent)",
            }}
          >
            Wipe local data
          </button>
        </>
      )}

      {state === "working" && (
        <p className="text-sm opacity-70">Resetting…</p>
      )}

      {state === "done" && (
        <>
          <p
            className="rounded-md px-3 py-2 text-sm"
            style={{
              border: "1px solid var(--wtm-accent)",
              background: "var(--wtm-accent-dim)",
            }}
          >
            Local data cleared. Reload to start fresh.
          </p>
          <Link
            href="/"
            className="block rounded-md px-4 py-3 text-center text-sm font-semibold uppercase tracking-wider"
            style={{
              border: "1px solid var(--wtm-accent)",
              color: "var(--wtm-accent)",
            }}
          >
            Back to home
          </Link>
        </>
      )}

      {state === "error" && (
        <p className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm">
          Couldn&apos;t reset: {err}. Try clearing browser storage manually
          via dev tools.
        </p>
      )}
    </main>
  );
}
