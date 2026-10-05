import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import createNextIntlPlugin from "next-intl/plugin";
import { withPostHogConfig } from "@posthog/nextjs-config";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.convex.cloud",
        port: "",
        pathname: "/api/storage/**",
      },
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
      {
        protocol: "https",
        hostname: "images.clerk.dev",
      },
    ],
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

function config(phase: string): NextConfig {
  return withNextIntl({
    ...nextConfig,
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  });
}

// Keep PostHog outermost: Next.js invokes its returned config function only once.
// Development and builds without private credentials do not upload source maps.
export default process.env.NODE_ENV === "production" &&
process.env.POSTHOG_API_KEY &&
process.env.POSTHOG_PROJECT_ID
  ? withPostHogConfig(config, {
      personalApiKey: process.env.POSTHOG_API_KEY,
      projectId: process.env.POSTHOG_PROJECT_ID,
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      sourcemaps: { enabled: true, deleteAfterUpload: true },
    })
  : config;
