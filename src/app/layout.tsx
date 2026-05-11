import type { Metadata } from "next";
import "./globals.css";
import { FeedProvider } from "@/components/FeedProvider";
import { LapSyncProvider } from "@/components/LapSyncProvider";

export const metadata: Metadata = {
  title: "WTM Athlete Tracker",
  description: "Follow athletes at World's Toughest Mudder 2026",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <FeedProvider>
          <LapSyncProvider>{children}</LapSyncProvider>
        </FeedProvider>
      </body>
    </html>
  );
}
