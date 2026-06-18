"use client";

import { useEffect } from "react";
import {
  DISPLAY_SCALE_EVENT,
  DISPLAY_SCALE_KEY,
  computeFactor,
  readScaleMode,
} from "@/lib/display-scale";

/**
 * Keeps the document's `zoom` in sync with the user's display-scale preference.
 * In `auto` mode it re-applies on viewport resize so the UI tracks the screen;
 * it also listens for the in-app change event (Settings → Display size) and the
 * cross-tab `storage` event. Renders nothing. The initial pre-paint application
 * is handled by the inline no-flash script in app/layout.tsx so there's no
 * flash of unscaled UI before this mounts.
 */
export function DisplayScaleProvider() {
  useEffect(() => {
    const apply = () => {
      const factor = computeFactor(readScaleMode(), window.innerWidth);
      document.documentElement.style.zoom = String(factor);
    };
    apply();

    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === DISPLAY_SCALE_KEY) apply();
    };

    window.addEventListener("resize", onResize);
    window.addEventListener(DISPLAY_SCALE_EVENT, apply);
    window.addEventListener("storage", onStorage);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener(DISPLAY_SCALE_EVENT, apply);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return null;
}
