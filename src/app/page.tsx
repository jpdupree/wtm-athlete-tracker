"use client";

import Link from "next/link";
import { FollowedList } from "@/components/FollowedList";
import { ThemeToggle } from "@/components/ThemeToggle";
import { YearPicker } from "@/components/YearPicker";
import { useSelectedYear } from "@/hooks/useSelectedYear";
import { configFor, liveResultsUrlFor } from "@/lib/years";

const SOCIAL = [
  { label: "Facebook", href: "https://www.facebook.com/theocrreport", icon: FacebookIcon },
  { label: "Instagram", href: "https://www.instagram.com/theocrreport", icon: InstagramIcon },
  { label: "YouTube", href: "https://www.youtube.com/@theocrreport", icon: YouTubeIcon },
];

export default function HomePage() {
  const [year] = useSelectedYear();
  const yearConfig = configFor(year);
  const liveUrl = liveResultsUrlFor(year);

  const links: Array<{ label: string; sub: string; href: string | null }> = [
    {
      label: "Live results",
      sub: `World's Toughest Mudder ${year}`,
      href: liveUrl,
    },
    {
      label: "The OCR Report",
      sub: "theocrreport.com",
      href: "https://theocrreport.com/",
    },
    // Year-specific YouTube stream: race-day live for the current year,
    // recorded broadcast for past years. Years with no known stream URL
    // (2021 — pre-broadcast era) drop the row entirely rather than show
    // a permanent "link pending" placeholder.
    ...(yearConfig.liveStreamUrl
      ? [{
          label: "Live race feed",
          sub: `${year} broadcast`,
          href: yearConfig.liveStreamUrl,
        }]
      : []),
  ];

  return (
    <main className="mx-auto max-w-md px-4 pb-10 pt-6 space-y-6">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
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
              World&apos;s Toughest Mudder · {year}
            </p>
            <div
              className="h-px w-12 mt-2"
              style={{ background: "var(--wtm-accent)" }}
            />
          </div>
          <ThemeToggle />
        </div>
        <YearPicker />
      </header>

      {!yearConfig.hasData && (
        <p
          className="rounded-md px-3 py-2 text-xs"
          style={{
            border: "1px solid var(--wtm-accent)",
            background: "var(--wtm-accent-dim)",
          }}
        >
          Data for {year} isn&apos;t wired up yet — followed list and the
          calculator still work, but live athlete data will be empty.
          {liveUrl == null && " The live-results link is also pending the event id."}
        </p>
      )}

      <FollowedList />

      <Link
        href="/pace"
        className="block rounded-md px-4 py-3 text-center text-sm font-semibold uppercase tracking-wider transition-colors"
        style={{
          border: "1px solid var(--wtm-accent)",
          color: "var(--wtm-accent)",
          background: "transparent",
        }}
      >
        Pace calculator
      </Link>

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

      <a
        href="https://toughmudder.com/events/worlds-toughest-mudder"
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-between rounded-md px-4 py-3 transition-colors"
        style={{
          border: "1px solid var(--wtm-accent)",
          background: "var(--wtm-accent-dim)",
        }}
      >
        <span>
          <p
            className="wtm-display text-xl leading-none"
            style={{ color: "var(--wtm-accent)" }}
          >
            The Event
          </p>
          <p className="text-[11px] opacity-70 mt-1">
            World&apos;s Toughest Mudder · toughmudder.com
          </p>
        </span>
        <span
          aria-hidden
          className="text-sm font-bold"
          style={{ color: "var(--wtm-accent)" }}
        >
          ↗
        </span>
      </a>

      <nav className="space-y-2">
        <p className="text-[10px] uppercase tracking-[0.18em] opacity-50 pl-1">
          External
        </p>
        {links.map((l) => {
          const disabled = !l.href;
          const content = (
            <>
              <span>
                <p className="text-sm font-semibold uppercase tracking-wide">
                  {l.label}
                </p>
                <p className="text-[11px] opacity-50">
                  {l.sub}
                  {disabled && " (link pending)"}
                </p>
              </span>
              <span
                aria-hidden
                className="text-sm font-bold"
                style={{ color: disabled ? "var(--wtm-fg-muted)" : "var(--wtm-accent)" }}
              >
                ↗
              </span>
            </>
          );
          const baseStyle = {
            border: "1px solid var(--wtm-border)",
            background: "var(--wtm-surface)",
            opacity: disabled ? 0.55 : 1,
          };
          if (!l.href) {
            return (
              <div
                key={l.label}
                className="flex items-center justify-between rounded-md px-4 py-3"
                style={baseStyle}
              >
                {content}
              </div>
            );
          }
          return (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-md px-4 py-3 transition-colors"
              style={baseStyle}
            >
              {content}
            </a>
          );
        })}
      </nav>

      <footer className="pt-2 space-y-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] opacity-50 text-center mb-2">
            Follow The OCR Report
          </p>
          <div className="flex items-center justify-center gap-3">
            {SOCIAL.map(({ label, href, icon: Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={label}
                title={label}
                className="inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors"
                style={{
                  border: "1px solid var(--wtm-border)",
                  background: "var(--wtm-surface)",
                  color: "var(--wtm-fg)",
                }}
              >
                <Icon />
              </a>
            ))}
          </div>
        </div>

        <div
          className="pt-5 flex flex-col items-center gap-2"
          style={{ borderTop: "1px solid var(--wtm-border)" }}
        >
          <BrandMark />
          <p className="text-[10px] opacity-50 tabular-nums">
            © {new Date().getFullYear()} The OCR Report
          </p>
        </div>
      </footer>
    </main>
  );
}

// Theme-paired logo. CSS in globals.css swaps which one is visible based
// on the html[data-theme] attribute.
function BrandMark() {
  return (
    <div className="flex flex-col items-center select-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-light.png"
        alt="The OCR Report"
        width={512}
        height={512}
        className="wtm-logo-light h-20 w-auto"
        loading="lazy"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-dark.png"
        alt="The OCR Report"
        width={512}
        height={512}
        className="wtm-logo-dark h-20 w-auto"
        loading="lazy"
      />
    </div>
  );
}

function FacebookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.25-1.5 1.55-1.5H16.5V4.4c-.3 0-1.2-.1-2.25-.1-2.25 0-3.75 1.35-3.75 3.85v2.35H8v3h2.5V21h3z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <circle cx="12" cy="12" r="3.8" />
      <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M21.6 7.2a2.5 2.5 0 0 0-1.75-1.77C18.3 5 12 5 12 5s-6.3 0-7.85.43A2.5 2.5 0 0 0 2.4 7.2C2 8.75 2 12 2 12s0 3.25.4 4.8a2.5 2.5 0 0 0 1.75 1.77C5.7 19 12 19 12 19s6.3 0 7.85-.43a2.5 2.5 0 0 0 1.75-1.77C22 15.25 22 12 22 12s0-3.25-.4-4.8z" />
      <polygon points="10,8.5 16,12 10,15.5" fill="var(--wtm-bg)" />
    </svg>
  );
}
