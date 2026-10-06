import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  // Service worker source (compiled by Next.js)
  swSrc: "src/app/sw.ts",
  // Output path inside .next/static (served as /sw.js)
  swDest: "public/sw.js",
  // Disable in development — only active in production builds
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default withSerwist(nextConfig);
