"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type FuelEntry, type Note } from "@/lib/db";

type Target = "lap" | "pit";

export function LapCard({
  bib,
  lapNumber,
  inProgress,
}: {
  bib: number;
  lapNumber: number;
  inProgress: boolean;
}) {
  return (
    <details
      open={inProgress}
      className="rounded-lg border border-current/20 overflow-hidden"
    >
      <summary className="flex items-center justify-between cursor-pointer px-4 py-3 select-none">
        <span className="font-semibold">
          Lap {lapNumber}
          {inProgress && (
            <span className="ml-2 text-xs font-normal opacity-60">in progress</span>
          )}
        </span>
        <Counts bib={bib} lapNumber={lapNumber} />
      </summary>
      <div className="border-t border-current/10 divide-y divide-current/10">
        <Section title={`Lap ${lapNumber} fuel`} bib={bib} lapNumber={lapNumber} target="lap" kind="fuel" />
        <Section title={`Lap ${lapNumber} notes`} bib={bib} lapNumber={lapNumber} target="lap" kind="note" />
        {!inProgress && (
          <>
            <Section title={`Pit ${lapNumber} fuel`} bib={bib} lapNumber={lapNumber} target="pit" kind="fuel" />
            <Section title={`Pit ${lapNumber} notes`} bib={bib} lapNumber={lapNumber} target="pit" kind="note" />
          </>
        )}
      </div>
    </details>
  );
}

function Counts({ bib, lapNumber }: { bib: number; lapNumber: number }) {
  const fuel = useLiveQuery(
    () => db.fuel.where("[bib+lapNumber]").equals([bib, lapNumber]).count(),
    [bib, lapNumber],
  );
  const notes = useLiveQuery(
    () => db.notes.where("[bib+lapNumber]").equals([bib, lapNumber]).count(),
    [bib, lapNumber],
  );
  if (!fuel && !notes) return <span className="text-xs opacity-50">—</span>;
  return (
    <span className="text-xs opacity-70 tabular-nums">
      {fuel ? `${fuel} fuel` : ""}
      {fuel && notes ? " · " : ""}
      {notes ? `${notes} notes` : ""}
    </span>
  );
}

function Section({
  title,
  bib,
  lapNumber,
  target,
  kind,
}: {
  title: string;
  bib: number;
  lapNumber: number;
  target: Target;
  kind: "fuel" | "note";
}) {
  return (
    <div className="px-4 py-3 space-y-2">
      <p className="text-xs uppercase tracking-wide opacity-60">{title}</p>
      {kind === "fuel" ? (
        <>
          <FuelEntries bib={bib} lapNumber={lapNumber} target={target} />
          <AddFuel bib={bib} lapNumber={lapNumber} target={target} />
        </>
      ) : (
        <>
          <NoteEntries bib={bib} lapNumber={lapNumber} target={target} />
          <AddNote bib={bib} lapNumber={lapNumber} target={target} />
        </>
      )}
    </div>
  );
}

function FuelEntries({ bib, lapNumber, target }: { bib: number; lapNumber: number; target: Target }) {
  const items = useLiveQuery(
    () =>
      db.fuel
        .where("[bib+lapNumber]")
        .equals([bib, lapNumber])
        .filter((e) => e.target === target)
        .sortBy("ts"),
    [bib, lapNumber, target],
  );
  if (!items?.length) return null;
  return (
    <ul className="space-y-1">
      {items.map((e) => (
        <li key={e.id} className="flex items-center justify-between text-sm">
          <span className="truncate">
            {e.label || "—"}
            <span className="ml-2 opacity-60 tabular-nums">
              {[
                e.kcal != null && `${e.kcal} kcal`,
                e.sodiumMg != null && `${e.sodiumMg} mg Na`,
                e.fluidMl != null && `${e.fluidMl} ml`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <button
            onClick={() => db.fuel.delete(e.id)}
            aria-label="Remove fuel entry"
            className="ml-2 text-xs opacity-50 hover:opacity-100"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

function NoteEntries({ bib, lapNumber, target }: { bib: number; lapNumber: number; target: Target }) {
  const items = useLiveQuery(
    () =>
      db.notes
        .where("[bib+lapNumber]")
        .equals([bib, lapNumber])
        .filter((n) => n.target === target)
        .sortBy("ts"),
    [bib, lapNumber, target],
  );
  if (!items?.length) return null;
  return (
    <ul className="space-y-1">
      {items.map((n) => (
        <li key={n.id} className="flex items-start justify-between text-sm">
          <span className="break-words">{n.text}</span>
          <button
            onClick={() => db.notes.delete(n.id)}
            aria-label="Remove note"
            className="ml-2 text-xs opacity-50 hover:opacity-100"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

function AddFuel({ bib, lapNumber, target }: { bib: number; lapNumber: number; target: Target }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [kcal, setKcal] = useState("");
  const [sodium, setSodium] = useState("");
  const [fluid, setFluid] = useState("");
  const [note, setNote] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs underline opacity-70"
      >
        + Log fuel
      </button>
    );
  }

  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const entry: FuelEntry = {
          id: crypto.randomUUID(),
          bib,
          target,
          lapNumber,
          kcal: kcal.trim() ? parseInt(kcal, 10) : null,
          sodiumMg: sodium.trim() ? parseInt(sodium, 10) : null,
          fluidMl: fluid.trim() ? parseInt(fluid, 10) : null,
          label: label.trim() || null,
          note: note.trim() || null,
          ts: new Date().toISOString(),
        };
        await db.fuel.add(entry);
        setLabel(""); setKcal(""); setSodium(""); setFluid(""); setNote("");
        setOpen(false);
      }}
    >
      <input
        placeholder="Label (gel, bar, drink…)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="w-full rounded-md border border-current/20 bg-transparent px-2 py-1 text-sm"
      />
      <div className="grid grid-cols-3 gap-2">
        <input placeholder="kcal" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} className="rounded-md border border-current/20 bg-transparent px-2 py-1 text-sm" />
        <input placeholder="mg Na" inputMode="numeric" value={sodium} onChange={(e) => setSodium(e.target.value)} className="rounded-md border border-current/20 bg-transparent px-2 py-1 text-sm" />
        <input placeholder="ml" inputMode="numeric" value={fluid} onChange={(e) => setFluid(e.target.value)} className="rounded-md border border-current/20 bg-transparent px-2 py-1 text-sm" />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="rounded-md border border-current/40 px-3 py-1 text-xs font-medium">Save</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md px-3 py-1 text-xs opacity-60">Cancel</button>
      </div>
    </form>
  );
}

function AddNote({ bib, lapNumber, target }: { bib: number; lapNumber: number; target: Target }) {
  const [text, setText] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        const n: Note = {
          id: crypto.randomUUID(),
          bib,
          target,
          lapNumber,
          text: text.trim(),
          ts: new Date().toISOString(),
        };
        await db.notes.add(n);
        setText("");
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. headlamp, change shoes"
        className="flex-1 rounded-md border border-current/20 bg-transparent px-2 py-1 text-sm"
      />
      <button type="submit" disabled={!text.trim()} className="rounded-md border border-current/40 px-3 py-1 text-xs font-medium disabled:opacity-50">
        Add
      </button>
    </form>
  );
}
