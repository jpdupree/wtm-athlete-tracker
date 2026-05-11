import type { MetadataRoute } from "next";
import { RESULTS_YEAR } from "@/lib/race";

// Dynamic PWA manifest so RESULTS_YEAR flows through to install-prompt
// descriptions, "About this app" text, etc. without a parallel hand-edit.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WTM Athlete Tracker",
    short_name: "WTM",
    description: `Follow athletes at World's Toughest Mudder ${RESULTS_YEAR}`,
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#ff6b14",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
    ],
  };
}
