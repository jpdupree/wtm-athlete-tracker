"use client";

import { useEffect } from "react";

// Global listener: any print trigger (Print button, Ctrl+P, browser menu,
// "Save as PDF") opens every <details> on the page so the printed output
// includes all collapsed sections, then restores the previous open/closed
// state once printing finishes (or the dialog is dismissed).
export function PrintReadyHook() {
  useEffect(() => {
    let snapshot: Array<{ el: HTMLDetailsElement; wasOpen: boolean }> = [];

    const onBefore = () => {
      snapshot = Array.from(
        document.querySelectorAll<HTMLDetailsElement>("details"),
      ).map((el) => ({ el, wasOpen: el.open }));
      snapshot.forEach(({ el }) => {
        el.open = true;
      });
    };

    const onAfter = () => {
      snapshot.forEach(({ el, wasOpen }) => {
        el.open = wasOpen;
      });
      snapshot = [];
    };

    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);
    return () => {
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
    };
  }, []);

  return null;
}
