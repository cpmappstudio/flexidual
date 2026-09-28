import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { encryptSession, encryptCredentials } from "../lib/abeka/encryption";
import { ConvexError } from "convex/values";
import { readBoundedText, validateCookieHeader } from "../lib/abeka/session";
import { abekaFetch } from "./model/abekaTransport";
import {
  LoginProbeError,
  probeAbekaLogin,
  signInAbeka,
  validateLoginCredentials,
} from "../lib/abeka/login-probe";

// Bearer-only authentication; cookies are never accepted as Flexidual credentials.
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
export const options = httpAction(
  async () => new Response(null, { status: 204, headers }),
);

export const connect = httpAction(async (ctx, request) => {
  try {
    if (
      !request.headers.get("Authorization")?.startsWith("Bearer ") ||
      !(await ctx.auth.getUserIdentity())
    )
      return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers });
    const schoolId = new URL(request.url).searchParams.get(
      "schoolId",
    ) as Id<"schools"> | null;
    if (!schoolId || request.headers.get("Content-Type") !== "text/plain")
      return Response.json(
        { error: "INVALID_REQUEST" },
        { status: 400, headers },
      );
    const expectedRevision = await ctx.runMutation(
      internal.abeka.authorizeConnection,
      { schoolId },
    );
    const secret = process.env.ABEKA_SESSION_ENCRYPTION_KEY ?? "";
    if (!/^[a-f0-9]{64}$/i.test(secret))
      return Response.json(
        { error: "NOT_CONFIGURED" },
        { status: 503, headers },
      );
    const cookie = validateCookieHeader(
      await readBoundedText(new Response(request.body), 16_384),
    );
    const encrypted = await encryptSession(cookie, secret, schoolId);
    await ctx.runMutation(internal.abeka.saveSession, {
      schoolId,
      encrypted,
      expectedRevision,
    });
    return Response.json({ accepted: true }, { status: 202, headers });
  } catch {
    // Never log the request, exception, cookie, or provider response.
    return Response.json(
      { error: "CONNECTION_REJECTED" },
      { status: 400, headers },
    );
  }
});

// Secrets enter through HTTP only; registered functions receive ciphertext, never passwords.
export const connectCredentials = httpAction(async (ctx, request) => {
  try {
    if (
      !request.headers.get("Authorization")?.startsWith("Bearer ") ||
      !(await ctx.auth.getUserIdentity())
    )
      return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers });
    const schoolId = new URL(request.url).searchParams.get(
      "schoolId",
    ) as Id<"schools"> | null;
    if (!schoolId || request.headers.get("Content-Type") !== "application/json")
      return Response.json(
        { error: "INVALID_REQUEST" },
        { status: 400, headers },
      );
    const expectedRevision = await ctx.runMutation(
      internal.abeka.authorizeConnection,
      { schoolId },
    );
    const key = process.env.ABEKA_SESSION_ENCRYPTION_KEY ?? "";
    if (!/^[a-f0-9]{64}$/i.test(key))
      return Response.json(
        { error: "NOT_CONFIGURED" },
        { status: 503, headers },
      );
    const credentials = validateLoginCredentials(
      JSON.parse(await readBoundedText(new Response(request.body), 8192)),
    );
    try {
      const result = await signInAbeka(credentials, abekaFetch(ctx));
      await ctx.runMutation(internal.abeka.saveSession, {
        schoolId,
        expectedRevision,
        externalSchoolId: result.externalSchoolId,
        encrypted: await encryptSession(result.cookie, key, schoolId),
        credentials: await encryptCredentials(credentials, key, schoolId),
      });
      return Response.json({ accepted: true }, { status: 202, headers });
    } finally {
      credentials.password = "";
      credentials.username = "";
    }
  } catch (error) {
    const code =
      error instanceof LoginProbeError
        ? error.code
        : error instanceof ConvexError &&
            ["SCHOOL_MISMATCH", "CONNECTION_CHANGED"].includes(
              String(error.data),
            )
          ? String(error.data)
          : "CONNECTION_REJECTED";
    return Response.json({ error: code }, { status: 400, headers });
  }
});

// Opt-in development probe. No credentials or session are persisted, and the
// existing integration/workflow is never changed by this endpoint.
export const loginProbe = httpAction(async (ctx, request) => {
  if (process.env.ABEKA_LOGIN_PROBE_ENABLED !== "true")
    return Response.json({ error: "NOT_ENABLED" }, { status: 404, headers });
  try {
    if (
      !request.headers.get("Authorization")?.startsWith("Bearer ") ||
      !(await ctx.auth.getUserIdentity())
    )
      return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers });
    const schoolId = new URL(request.url).searchParams.get(
      "schoolId",
    ) as Id<"schools"> | null;
    if (!schoolId || request.headers.get("Content-Type") !== "application/json")
      return Response.json(
        { error: "INVALID_REQUEST" },
        { status: 400, headers },
      );
    await ctx.runMutation(internal.abeka.authorizeConnection, { schoolId });
    const credentials = validateLoginCredentials(
      JSON.parse(await readBoundedText(new Response(request.body), 8192)),
    );
    try {
      const result = await probeAbekaLogin(credentials, abekaFetch(ctx));
      return Response.json({ verified: true, ...result }, { headers });
    } finally {
      credentials.password = "";
    }
  } catch (error) {
    return Response.json(
      {
        error: error instanceof LoginProbeError ? error.code : "PROBE_REJECTED",
        diagnostic:
          error instanceof LoginProbeError ? error.diagnostic : undefined,
      },
      { status: 400, headers },
    );
  }
});
