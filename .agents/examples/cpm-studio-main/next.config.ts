import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { locales } from "./i18n/routing";

const withNextIntl = createNextIntlPlugin();
const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.split(":")[0];
const localeMatcher = locales.join("|");

const allowedDevOrigins = ["localhost", "*.localhost"];
if (rootDomain && rootDomain !== "localhost") {
  allowedDevOrigins.push(rootDomain, `*.${rootDomain}`);
}

const nextConfig: NextConfig = {
  allowedDevOrigins,
  async redirects() {
    return [
      {
        source: `/:locale(${localeMatcher})/platform`,
        destination: "/:locale/institutions",
        permanent: true,
      },
      {
        source: `/:locale(${localeMatcher})/platform/team-settings`,
        destination: "/:locale/institutions/team-settings",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
