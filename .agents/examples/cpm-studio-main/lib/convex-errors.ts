import { ConvexError } from "convex/values";

export function getConvexErrorCode(error: unknown) {
  if (!(error instanceof ConvexError) || typeof error.data !== "object") {
    return null;
  }

  const code = (error.data as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function getErrorCode(error: unknown) {
  const convexErrorCode = getConvexErrorCode(error);
  if (convexErrorCode) {
    return convexErrorCode;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return null;
}
