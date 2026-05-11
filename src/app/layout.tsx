import type { Metadata, Viewport } from "next";
import { Bebas_Neue } from "next/font/google";
import "./globals.css";
import { FeedProvider } from "@/components/FeedProvider";
import { LapSyncProvider } from "@/components/LapSyncProvider";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const displayFont = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-wtm-display",
});

export const metadata: Metadata = {
  title: "WTM Athlete Tracker",
  description: "Follow athletes at World's Toughest Mudder 2026",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "WTM" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Runs before paint so the theme tokens are applied without a flash. Reads
// localStorage; falls back to system preference; default (no script run) is
// the dark tokens already on :root.
const themeInitScript = `(function(){try{var k='wtm-theme';var t=localStorage.getItem(k);if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={displayFont.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <FeedProvider>
          <LapSyncProvider>{children}</LapSyncProvider>
        </FeedProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
