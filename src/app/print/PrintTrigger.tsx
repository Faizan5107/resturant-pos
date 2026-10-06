"use client";

import { useEffect } from "react";

export default function PrintTrigger() {
  useEffect(() => {
    // Auto trigger browser print dialog
    const timer = setTimeout(() => {
      window.print();
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
