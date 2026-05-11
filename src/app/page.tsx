import Link from "next/link";
import { FollowedList } from "@/components/FollowedList";
import { ThemeToggle } from "@/components/ThemeToggle";

const LINKS = [
  // Pointing at the 2025 event for now until the 2026 page goes live.
  { label: "Live results", sub: "RaceResult — event 348237", href: "https://my.raceresult.com/348237/" },
  { label: "The OCR Report", sub: "theocrreport.com", href: "#" },
  { label: "YouTube", sub: "OCR Report channel", href: "#" },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-md px-4 pb-10 pt-6 space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-baseline gap-2">
            <span
              className="wtm-display text-4xl font-bold leading-none"
              style={{ color: "var(--wtm-accent)" }}
            >
              WTM
            </span>
            <span className="wtm-display text-2xl leading-none opacity-80">
              Tracker
            </span>
          </div>
          <p className="text-xs uppercase tracking-[0.18em] opacity-50">
            World&apos;s Toughest Mudder · 27 Jun 2026
          </p>
          <div
            className="h-px w-12 mt-2"
            style={{ background: "var(--wtm-accent)" }}
          />
        </div>
        <ThemeToggle />
      </header>

      <FollowedList />

      <Link
        href="/map"
        className="block rounded-md px-4 py-3 text-center text-sm font-semibold uppercase tracking-wider transition-colors"
        style={{
          border: "1px solid var(--wtm-border-strong)",
          background: "var(--wtm-surface)",
        }}
      >
        Course view
      </Link>

      <nav className="space-y-2">
        <p className="text-[10px] uppercase tracking-[0.18em] opacity-50 pl-1">
          External
        </p>
        {LINKS.map((l) => (
          <a
            key={l.label}
            href={l.href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-md px-4 py-3 transition-colors"
            style={{
              border: "1px solid var(--wtm-border)",
              background: "var(--wtm-surface)",
            }}
          >
            <span>
              <p className="text-sm font-semibold uppercase tracking-wide">
                {l.label}
              </p>
              <p className="text-[11px] opacity-50">{l.sub}</p>
            </span>
            <span
              aria-hidden
              className="text-sm font-bold"
              style={{ color: "var(--wtm-accent)" }}
            >
              ↗
            </span>
          </a>
        ))}
      </nav>
    </main>
  );
}
