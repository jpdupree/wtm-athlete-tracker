"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // If a controller already exists, a later controllerchange means a NEW
    // service worker took over (an update) — reload once so the page runs
    // against the fresh assets. Guard against the first-install
    // controllerchange (no prior controller) and against reload loops.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    const onControllerChange = () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Proactively check for an updated SW on every load so a deploy
        // propagates to already-open devices without manual cache clears.
        reg.update().catch(() => {});
      })
      .catch(() => {
        /* swallow — SW is best-effort */
      });

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, []);

  return null;
}
