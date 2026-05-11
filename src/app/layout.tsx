import type { Metadata, Viewport } from "next";
import "./globals.css";
import { FeedProvider } from "@/components/FeedProvider";
import { LapSyncProvider } from "@/components/LapSyncProvider";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <FeedProvider>
          <LapSyncProvider>{children}</LapSyncProvider>
        </FeedProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
