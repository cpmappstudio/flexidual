export const INVITATION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const INVITE_PATH = "/invite";

export function normalizeInvitationEmail(email: string) {
  return email.trim().toLowerCase();
}

export function createInvitationToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function hashInvitationToken(token: string) {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );

  return Array.from(new Uint8Array(buffer), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export function normalizeInvitationBaseUrl(baseUrlOrRootDomain: string) {
  const trimmedValue = baseUrlOrRootDomain.trim();
  if (!trimmedValue) {
    return null;
  }

  const hasProtocol =
    trimmedValue.startsWith("http://") || trimmedValue.startsWith("https://");
  const isLocalHostLike =
    trimmedValue.startsWith("localhost") ||
    trimmedValue.startsWith("127.0.0.1") ||
    trimmedValue.startsWith("[::1]") ||
    trimmedValue.startsWith("http://localhost") ||
    trimmedValue.startsWith("http://127.0.0.1") ||
    trimmedValue.startsWith("http://[::1]") ||
    trimmedValue.startsWith("https://localhost") ||
    trimmedValue.startsWith("https://127.0.0.1") ||
    trimmedValue.startsWith("https://[::1]");
  const protocol = isLocalHostLike ? "http" : "https";
  const candidateUrl = hasProtocol
    ? trimmedValue
    : `${protocol}://${trimmedValue}`;

  try {
    return new URL(candidateUrl).origin;
  } catch {
    return null;
  }
}

function getInvitationBaseUrl() {
  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) {
    return null;
  }

  return normalizeInvitationBaseUrl(baseUrl);
}

export function buildInvitationAcceptUrlForBaseUrl(args: {
  baseUrl: string;
  locale: "en" | "es";
  token: string;
}) {
  const normalizedBaseUrl = normalizeInvitationBaseUrl(args.baseUrl);
  if (!normalizedBaseUrl) {
    return null;
  }

  const url = new URL(`/${args.locale}${INVITE_PATH}`, normalizedBaseUrl);
  url.searchParams.set("token", args.token);
  return url.toString();
}

export function buildInvitationAcceptUrl(args: {
  locale: "en" | "es";
  token: string;
}) {
  const baseUrl = getInvitationBaseUrl();
  if (!baseUrl) {
    return null;
  }

  const url = new URL(`/${args.locale}${INVITE_PATH}`, baseUrl);
  url.searchParams.set("token", args.token);
  return url.toString();
}
