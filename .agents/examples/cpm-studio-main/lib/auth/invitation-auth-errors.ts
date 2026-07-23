import { ConvexError } from "convex/values";

const INVITATION_AUTH_ERROR_TAG = "PLATFORM_INVITATION_AUTH";

export const INVITATION_AUTH_ERROR_CODES = {
  invalidOrExpired: "INVALID_OR_EXPIRED",
  passwordTooShort: "PASSWORD_TOO_SHORT",
} as const;

export type InvitationAuthErrorCode =
  (typeof INVITATION_AUTH_ERROR_CODES)[keyof typeof INVITATION_AUTH_ERROR_CODES];

type InvitationAuthErrorPayload = {
  tag: typeof INVITATION_AUTH_ERROR_TAG;
  code: InvitationAuthErrorCode;
};

// Throws via ConvexError so the typed payload survives the round-trip from the
// Convex Auth `signIn` action back to the browser. The tag value remains stable
// for existing serialized errors even though invitation auth is now shared.
export function throwInvitationAuthError(
  code: InvitationAuthErrorCode,
): never {
  const payload: InvitationAuthErrorPayload = {
    tag: INVITATION_AUTH_ERROR_TAG,
    code,
  };
  throw new ConvexError(payload);
}

const VALID_CODES = new Set<string>(Object.values(INVITATION_AUTH_ERROR_CODES));

export function getInvitationAuthErrorCode(
  error: unknown,
): InvitationAuthErrorCode | null {
  if (!(error instanceof ConvexError)) {
    return null;
  }

  const data = error.data as Partial<InvitationAuthErrorPayload> | null;
  if (!data || data.tag !== INVITATION_AUTH_ERROR_TAG) {
    return null;
  }

  return typeof data.code === "string" && VALID_CODES.has(data.code)
    ? (data.code as InvitationAuthErrorCode)
    : null;
}
