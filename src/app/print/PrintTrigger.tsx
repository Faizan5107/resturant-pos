"use client";

import { useEffect } from "react";

export default function PrintTrigger() {
  useEffect(() => {
    const handleAfterPrint = () => {
      try {
        window.close();
      } catch {}
    };

    window.addEventListener("afterprint", handleAfterPrint);

    // Auto trigger browser print dialog
    const timer = setTimeout(() => {
      window.print();
    }, 300);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, []);

  return null;
}
