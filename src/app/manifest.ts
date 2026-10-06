import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Restaurant POS",
    short_name: "POS",
    description: "Restaurant Point-of-Sale — Cashier Terminal",
    start_url: "/cashier/new-order",
    display: "standalone",
    orientation: "landscape",
    background_color: "#ffffff",
    theme_color: "#000000",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    categories: ["business", "productivity"],
    prefer_related_applications: false,
  };
}
