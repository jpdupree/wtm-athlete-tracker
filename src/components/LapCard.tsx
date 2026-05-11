"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type FuelEntry, type Note } from "@/lib/db";
import { lapId, markLapManual } from "@/lib/lapSync";
import { fmtSec, fmtVenueClock } from "@/lib/format";
import { RACE_START } from "@/lib/race";

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
  const lap = useLiveQuery(() => db.laps.get(lapId(bib, lapNumber)), [bib, lapNumber]);
  const prevLap = useLiveQuery(
    async () =>
      lapNumber > 1 ? await db.laps.get(lapId(bib, lapNumber - 1)) : undefined,
    [bib, lapNumber],
  );
  const prevPrevLap = useLiveQuery(
    async () =>
      lapNumber > 2 ? await db.laps.get(lapId(bib, lapNumber - 2)) : undefined,
    [bib, lapNumber],
  );

  const completedAt = lap?.lapCompletedAt ?? null;
  const prevEnd =
    lapNumber === 1 ? RACE_START.toISOString() : prevLap?.lapCompletedAt ?? null;
  const durationSec =
    completedAt && prevEnd
      ? Math.round((new Date(completedAt).getTime() - new Date(prevEnd).getTime()) / 1000)
      : null;

  const prevPrevEnd =
    lapNumber === 2 ? RACE_START.toISOString() : prevPrevLap?.lapCompletedAt ?? null;
  const prevDurationSec =
    prevLap?.lapCompletedAt && prevPrevEnd
      ? Math.round(
          (new Date(prevLap.lapCompletedAt).getTime() - new Date(prevPrevEnd).getTime()) /
            1000,
        )
      : null;

  const deltaSec =
    durationSec != null && prevDurationSec != null ? durationSec - prevDurationSec : null;

  const source = lap?.source;
  const provisional = lap?.provisional;

  return (
    <details
      id={`lap-${lapNumber}`}
      open={inProgress}
      className="rounded-lg border border-current/20 overflow-hidden scroll-mt-4"
    >
      <summary className="flex items-center justify-between cursor-pointer px-4 py-3 select-none gap-2">
        <span className="min-w-0">
          <span className="font-semibold">Lap {lapNumber}</span>
          {inProgress && !completedAt && (
            <span className="ml-2 text-xs font-normal opacity-60">in progress</span>
          )}
          {completedAt && (
            <span className="ml-2 text-xs opacity-70 tabular-nums">
              {fmtVenueClock(completedAt)}
              {durationSec != null && ` · ${fmtSec(durationSec)}`}
              {deltaSec != null && (
                <span className={`ml-1 ${deltaColor(deltaSec)}`}>
                  ({deltaPrefix(deltaSec)}
                  {fmtSec(Math.abs(deltaSec))})
                </span>
              )}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {source === "manual" && provisional && (
            <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide">
              manual
            </span>
          )}
          {source === "api" && (
            <span className="rounded-full border border-green-500/50 bg-green-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide">
              api
            </span>
          )}
          <Counts bib={bib} lapNumber={lapNumber} />
        </span>
      </summary>

      <div className="border-t border-current/10 divide-y divide-current/10">
        {!completedAt && inProgress && (
          <div className="px-4 py-3">
            <button
              onClick={() => markLapManual(bib, lapNumber)}
              className="rounded-md border border-current/40 px-3 py-1 text-xs font-medium"
            >
              Mark lap {lapNumber} complete (now)
            </button>
            <p className="mt-1 text-[11px] opacity-60">
              Tags as provisional. The next API poll upgrades it once confirmed.
            </p>
          </div>
        )}

        <Section title={`Lap ${lapNumber} fuel`} bib={bib} lapNumber={lapNumber} target="lap" kind="fuel" />
        <Section title={`Lap ${lapNumber} notes`} bib={bib} lapNumber={lapNumber} target="lap" kind="note" />
        {!inProgress && (
          <>
            <PitTimer bib={bib} lapNumber={lapNumber} />
            <Section title={`Pit ${lapNumber} fuel`} bib={bib} lapNumber={lapNumber} target="pit" kind="fuel" />
            <Section title={`Pit ${lapNumber} notes`} bib={bib} lapNumber={lapNumber} target="pit" kind="note" />
          </>
        )}
      </div>
    </details>
  );
}

function deltaPrefix(sec: number): string {
  return sec > 0 ? "+" : sec < 0 ? "−" : "±";
}

function deltaColor(sec: number): string {
  if (sec >= 60) return "text-red-500";
  if (sec <= -60) return "text-green-500";
  return "text-amber-500";
}

function pitColor(sec: number): string {
  if (sec <= 15 * 60) return "text-green-500";
  if (sec <= 25 * 60) return "text-amber-500";
  return "text-red-500";
}

function PitTimer({ bib, lapNumber }: { bib: number; lapNumber: number }) {
  const lap = useLiveQuery(() => db.laps.get(lapId(bib, lapNumber)), [bib, lapNumber]);
  const start = lap?.pitStartedAt;
  const end = lap?.pitCompletedAt;
  const durationSec =
    start && end
      ? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
      : null;
  return (
    <div className="px-4 py-3 space-y-2">
      <p className="text-xs uppercase tracking-wide opacity-60">Pit {lapNumber} timing</p>
      <div className="flex items-center gap-2 text-sm">
        {start && (
          <span className="tabular-nums opacity-80">
            in {fmtVenueClock(start)}
          </span>
        )}
        {end && (
          <span className={`tabular-nums ${durationSec != null ? pitColor(durationSec) : ""}`}>
            out {fmtVenueClock(end)}
            {durationSec != null && ` · ${fmtSec(durationSec)}`}
          </span>
        )}
        {!start && !end && <span className="opacity-50">Not recorded.</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() =>
            db.laps.update(lapId(bib, lapNumber), {
              pitStartedAt: new Date().toISOString(),
            })
          }
          className="rounded-md border border-current/30 px-3 py-1 text-xs"
        >
          {start ? "Reset in" : "Mark into pit"}
        </button>
        <button
          disabled={!start}
          onClick={() =>
            db.laps.update(lapId(bib, lapNumber), {
              pitCompletedAt: new Date().toISOString(),
            })
          }
          className="rounded-md border border-current/30 px-3 py-1 text-xs disabled:opacity-40"
        >
          {end ? "Reset out" : "Mark out of pit"}
        </button>
        {(start || end) && (
          <button
            onClick={() =>
              db.laps.update(lapId(bib, lapNumber), {
                pitStartedAt: null,
                pitCompletedAt: null,
              })
            }
            className="rounded-md px-3 py-1 text-xs opacity-60"
          >
            Clear
          </button>
        )}
      </div>
    </div>
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
  if (!fuel && !notes) return <span className="text-xs opacity-40">—</span>;
  return (
    <span className="text-xs opacity-70 tabular-nums">
      {fuel ? `${fuel}f` : ""}
      {fuel && notes ? " · " : ""}
      {notes ? `${notes}n` : ""}
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

const FUEL_PRESETS: Array<{
  label: string;
  kcal: number | null;
  sodium: number | null;
  fluid: number | null;
}> = [
  { label: "Gel", kcal: 100, sodium: 30, fluid: 0 },
  { label: "Bar", kcal: 200, sodium: 100, fluid: 0 },
  { label: "Bottle (water)", kcal: 0, sodium: 0, fluid: 500 },
  { label: "Endurance drink", kcal: 200, sodium: 400, fluid: 500 },
  { label: "Salt cap", kcal: 0, sodium: 350, fluid: 0 },
  { label: "Real food", kcal: 250, sodium: 150, fluid: 0 },
];

function AddFuel({ bib, lapNumber, target }: { bib: number; lapNumber: number; target: Target }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [kcal, setKcal] = useState("");
  const [sodium, setSodium] = useState("");
  const [fluid, setFluid] = useState("");

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs underline opacity-70">
        + Log fuel
      </button>
    );
  }

  const applyPreset = (p: (typeof FUEL_PRESETS)[number]) => {
    setLabel(p.label);
    setKcal(p.kcal != null ? String(p.kcal) : "");
    setSodium(p.sodium != null ? String(p.sodium) : "");
    setFluid(p.fluid != null ? String(p.fluid) : "");
  };

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
          note: null,
          ts: new Date().toISOString(),
        };
        await db.fuel.add(entry);
        setLabel(""); setKcal(""); setSodium(""); setFluid("");
        setOpen(false);
      }}
    >
      <div className="flex flex-wrap gap-1">
        {FUEL_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p)}
            className="rounded-full border border-current/20 px-2 py-0.5 text-[11px] opacity-80 hover:opacity-100"
          >
            {p.label}
          </button>
        ))}
      </div>
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
