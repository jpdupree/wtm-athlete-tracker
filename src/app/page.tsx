import { FollowedList } from "@/components/FollowedList";

// External link URLs are placeholders — fill these in once the public RaceResult URL,
// theocrreport.com page, and OCR Report YouTube channel are confirmed.
const LINKS = [
  { label: "Live results (RaceResult)", href: "#" },
  { label: "theocrreport.com", href: "#" },
  { label: "OCR Report YouTube", href: "#" },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-md px-4 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">WTM Tracker</h1>
        <p className="text-sm opacity-70">World&apos;s Toughest Mudder · 27 Jun 2026</p>
      </header>

      <FollowedList />

      <nav className="space-y-2">
        {LINKS.map((l) => (
          <a
            key={l.label}
            href={l.href}
            target="_blank"
            rel="noreferrer"
            className="block rounded-md border border-current/20 px-4 py-3 text-sm"
          >
            {l.label}
          </a>
        ))}
      </nav>
    </main>
  );
}
