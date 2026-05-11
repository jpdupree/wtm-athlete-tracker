import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WTM Athlete Tracker",
  description: "Follow athletes at World's Toughest Mudder 2026",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
