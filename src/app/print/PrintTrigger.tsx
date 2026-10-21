"use client";

import { useEffect } from "react";

export default function PrintTrigger() {
  useEffect(() => {
    let cancelled = false;

    const handleAfterPrint = () => {
      try {
        window.close();
      } catch {}
    };
    window.addEventListener("afterprint", handleAfterPrint);

    const imagesReady = () =>
      Promise.all(
        Array.from(document.images).map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
              })
        )
      );

    (async () => {
      // Wait for logo + fonts, but never longer than 1.5s
      await Promise.race([
        Promise.all([imagesReady(), document.fonts?.ready]),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (!cancelled) window.print();
      });
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, []);

  return null;
}
