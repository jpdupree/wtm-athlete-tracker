"use client";

import { useState } from "react";
import { db, type FollowedAthlete } from "@/lib/db";
import { INTAKE_DEFAULTS, INTAKE_PROFILES } from "@/lib/intake";

export function IntakeTargetsEditor({ athlete }: { athlete: FollowedAthlete }) {
  const [open, setOpen] = useState(false);
  const [cal, setCal] = useState(String(athlete.targetCalPerHr ?? ""));
  const [fluid, setFluid] = useState(String(athlete.targetFluidMlPerHr ?? ""));
  const [na, setNa] = useState(String(athlete.targetSodiumMgPerHr ?? ""));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs underline opacity-70 print-hide"
      >
        Adjust intake targets
      </button>
    );
  }

  const num = (s: string): number | null => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  return (
    <form
      className="rounded-lg border border-dashed border-current/30 px-4 py-3 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        await db.followed.update(athlete.bib, {
          targetCalPerHr: num(cal),
          targetFluidMlPerHr: num(fluid),
          targetSodiumMgPerHr: num(na),
        });
        setOpen(false);
      }}
    >
      <p className="text-xs uppercase tracking-wide opacity-60">Targets / hour</p>

      <div className="space-y-1">
        <p className="text-[11px] opacity-60">Quick profile:</p>
        <div className="flex flex-wrap gap-1">
          {INTAKE_PROFILES.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => {
                setCal(String(p.calPerHr));
                setFluid(String(p.fluidMlPerHr));
                setNa(String(p.sodiumMgPerHr));
              }}
              className="rounded-full border border-current/20 px-2 py-0.5 text-[11px]"
              title={p.description}
            >
              {p.name} ({p.calPerHr}/{p.fluidMlPerHr}/{p.sodiumMgPerHr})
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <label>
          <span className="opacity-70">Calories</span>
          <input
            value={cal}
            onChange={(e) => setCal(e.target.value)}
            inputMode="numeric"
            placeholder={String(INTAKE_DEFAULTS.calPerHr)}
            className="mt-1 w-full rounded-md border border-current/20 bg-transparent px-2 py-1"
          />
        </label>
        <label>
          <span className="opacity-70">Fluid ml</span>
          <input
            value={fluid}
            onChange={(e) => setFluid(e.target.value)}
            inputMode="numeric"
            placeholder={String(INTAKE_DEFAULTS.fluidMlPerHr)}
            className="mt-1 w-full rounded-md border border-current/20 bg-transparent px-2 py-1"
          />
        </label>
        <label>
          <span className="opacity-70">Sodium mg</span>
          <input
            value={na}
            onChange={(e) => setNa(e.target.value)}
            inputMode="numeric"
            placeholder={String(INTAKE_DEFAULTS.sodiumMgPerHr)}
            className="mt-1 w-full rounded-md border border-current/20 bg-transparent px-2 py-1"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="rounded-md border border-current/40 px-3 py-1 text-xs font-medium">
          Save
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-3 py-1 text-xs opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={async () => {
            await db.followed.update(athlete.bib, {
              targetCalPerHr: null,
              targetFluidMlPerHr: null,
              targetSodiumMgPerHr: null,
            });
            setCal(""); setFluid(""); setNa("");
            setOpen(false);
          }}
          className="rounded-md px-3 py-1 text-xs opacity-60"
        >
          Reset to defaults
        </button>
      </div>
    </form>
  );
}
