"use client";

import { useState } from "react";
import { db } from "@/lib/db";

export function ManualAddForm({ initialName = "" }: { initialName?: string }) {
  const [name, setName] = useState(initialName);
  const [bib, setBib] = useState("");
  const [gender, setGender] = useState<"M" | "F" | "team">("M");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="rounded-lg border border-dashed border-current/30 p-4 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const bibN = parseInt(bib, 10);
        if (!name.trim()) return setError("Name required.");
        if (!Number.isFinite(bibN)) return setError("Bib must be a number.");
        const goalN = goal.trim() ? parseInt(goal, 10) : null;
        if (goal.trim() && !Number.isFinite(goalN)) return setError("Goal miles must be a number.");
        setBusy(true);
        try {
          const exists = await db.followed.get(bibN);
          if (exists) {
            setError(`Bib #${bibN} is already followed (${exists.name}).`);
            return;
          }
          await db.followed.add({
            bib: bibN,
            name: name.trim(),
            gender: gender === "team" ? null : gender,
            team: gender === "team" ? "Team" : null,
            goalMiles: goalN,
            addedAt: new Date().toISOString(),
          });
          setName("");
          setBib("");
          setGoal("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-xs opacity-60">Not on the start list? Add manually.</p>

      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 text-xs">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-current/20 bg-transparent px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs">
          Bib
          <input
            value={bib}
            onChange={(e) => setBib(e.target.value)}
            inputMode="numeric"
            className="mt-1 w-full rounded-md border border-current/20 bg-transparent px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs">
          Goal miles
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            inputMode="numeric"
            placeholder="optional"
            className="mt-1 w-full rounded-md border border-current/20 bg-transparent px-2 py-1 text-sm"
          />
        </label>
        <fieldset className="col-span-2 text-xs">
          <legend className="mb-1">Category</legend>
          <div className="flex gap-2">
            {(["M", "F", "team"] as const).map((g) => (
              <label key={g} className="flex items-center gap-1">
                <input
                  type="radio"
                  name="gender"
                  value={g}
                  checked={gender === g}
                  onChange={() => setGender(g)}
                />
                {g === "team" ? "Team" : g}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-md border border-current/40 px-3 py-1 text-xs font-medium disabled:opacity-50"
      >
        {busy ? "Adding…" : "Add manually"}
      </button>
    </form>
  );
}
