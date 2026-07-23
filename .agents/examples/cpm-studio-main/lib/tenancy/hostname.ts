import { parseTenantSlug } from "./slug";

const DEFAULT_ROOT_DOMAIN = "localhost:3000";
const LOCALHOST_HOSTNAME = "localhost";
const VERCEL_SUFFIX = ".vercel.app";

function stripPort(hostname: string) {
  return hostname.replace(/:\d+$/, "");
}

export function getRootDomain() {
  const configuredRootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.trim();

  if (configuredRootDomain) {
    return configuredRootDomain;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_ROOT_DOMAIN is required in production");
  }

  return DEFAULT_ROOT_DOMAIN;
}

export function normalizeHostname(host: string | null | undefined) {
  if (!host) {
    return null;
  }

  return stripPort(host.trim().toLowerCase()).replace(/\.$/, "");
}

function getRootHostname() {
  return normalizeHostname(getRootDomain()) ?? LOCALHOST_HOSTNAME;
}

export function getTenantSlugFromHost(host: string | null | undefined) {
  const hostname = normalizeHostname(host);
  if (!hostname) {
    return null;
  }

  if (hostname.endsWith(`.${LOCALHOST_HOSTNAME}`)) {
    const [subdomain] = hostname.split(".");
    return parseTenantSlug(subdomain);
  }

  if (hostname.includes("---") && hostname.endsWith(VERCEL_SUFFIX)) {
    const [previewSubdomain] = hostname.split("---");
    return parseTenantSlug(previewSubdomain);
  }

  const rootHostname = getRootHostname();
  const isManagedSubdomain =
    hostname !== rootHostname &&
    hostname !== `www.${rootHostname}` &&
    hostname.endsWith(`.${rootHostname}`);

  if (!isManagedSubdomain) {
    return null;
  }

  const candidate = hostname.slice(0, -(rootHostname.length + 1));
  if (candidate.includes(".")) {
    return null;
  }

  return parseTenantSlug(candidate);
}
