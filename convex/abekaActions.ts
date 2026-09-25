import { v } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { runArgs } from "./abekaSync";
import { abekaClient } from "../lib/abeka/report";
import {
  decryptSession,
  decryptCredentials,
  encryptSession,
} from "../lib/abeka/encryption";
import {
  signInAbeka,
  validateLoginCredentials,
} from "../lib/abeka/login-probe";
import { AuthenticationRequired, ProbeError } from "../lib/abeka/progress";
import { abekaFetch } from "./model/abekaTransport";
import { catalogSubject } from "./model/abekaValidators";
import type { CatalogSubject } from "../lib/abeka/catalog";

export const catalogGroups = internalAction({
  args: runArgs,
  returns: v.union(v.null(), v.array(v.string())),
  handler: async (ctx, { runId }): Promise<string[] | null> => {
    try {
      const schoolId = await ctx.runQuery(
        internal.abekaCatalog.expectedSchool,
        { runId },
      );
      if (!schoolId) return null;
      const result = await withSession(ctx, runId, (c) => c.catalogGroups());
      if (result.schoolId !== schoolId) {
        await ctx.runMutation(internal.abekaSync.fail, {
          runId,
          code: "SCHOOL_MISMATCH",
        });
        return null;
      }
      return result.groups;
    } catch (error) {
      await recordFailure(ctx, runId, error);
      return null;
    }
  },
});

export const catalogGrades = internalAction({
  args: { ...runArgs, groupId: v.string() },
  returns: v.union(v.null(), v.array(v.string())),
  handler: async (ctx, { runId, groupId }): Promise<string[] | null> => {
    try {
      return await withSession(ctx, runId, (c) => c.catalogGrades(groupId));
    } catch (error) {
      await recordFailure(ctx, runId, error);
      return null;
    }
  },
});

export const catalogSubjects = internalAction({
  args: { ...runArgs, groupId: v.string(), grade: v.string() },
  returns: v.union(v.null(), v.array(catalogSubject)),
  handler: async (
    ctx,
    { runId, groupId, grade },
  ): Promise<CatalogSubject[] | null> => {
    try {
      return await withSession(ctx, runId, (c) =>
        c.catalogSubjects(groupId, grade),
      );
    } catch (error) {
      await recordFailure(ctx, runId, error);
      return null;
    }
  },
});

async function client(ctx: ActionCtx, runId: Id<"abekaSyncRuns">) {
  const secret = await ctx.runQuery(internal.abekaSync.credentials, { runId });
  if (!secret) throw new AuthenticationRequired();
  return abekaClient(
    await decryptSession(
      secret.encrypted,
      process.env.ABEKA_SESSION_ENCRYPTION_KEY ?? "",
      secret.schoolId,
    ),
    abekaFetch(ctx, runId),
  );
}

async function renew(ctx: ActionCtx, runId: Id<"abekaSyncRuns">) {
  const claimed = await ctx.runMutation(internal.abekaSync.claimRenewal, {
    runId,
  });
  if (!claimed) throw new AuthenticationRequired();
  let credentials;
  try {
    const key = process.env.ABEKA_SESSION_ENCRYPTION_KEY ?? "";
    credentials = validateLoginCredentials(
      await decryptCredentials(claimed.credentials, key, claimed.schoolId),
    );
    const result = await signInAbeka(credentials, abekaFetch(ctx, runId));
    const encrypted = await encryptSession(
      result.cookie,
      key,
      claimed.schoolId,
    );
    if (
      !(await ctx.runMutation(internal.abekaSync.commitRenewal, {
        runId,
        encrypted,
        externalSchoolId: result.externalSchoolId,
      }))
    )
      throw new AuthenticationRequired();
  } catch {
    // A failed sign-in must require intervention, not schedule another password attempt.
    throw new AuthenticationRequired();
  } finally {
    if (credentials) credentials.password = "";
  }
}

async function withSession<T>(
  ctx: ActionCtx,
  runId: Id<"abekaSyncRuns">,
  read: (value: ReturnType<typeof abekaClient>) => Promise<T>,
): Promise<T> {
  try {
    return await read(await client(ctx, runId));
  } catch (error) {
    if (!(error instanceof AuthenticationRequired)) throw error;
    await renew(ctx, runId);
    return await read(await client(ctx, runId));
  }
}

async function recordFailure(
  ctx: ActionCtx,
  runId: Id<"abekaSyncRuns">,
  error: unknown,
) {
  const code =
    error instanceof AuthenticationRequired
      ? "NEEDS_RECONNECT"
      : error instanceof ProbeError
        ? error.message === "PROVIDER_UNAVAILABLE"
          ? "PROVIDER_UNAVAILABLE"
          : "REPORT_FORMAT_CHANGED"
        : "SYNC_FAILED";
  await ctx.runMutation(internal.abekaSync.fail, { runId, code });
}

export const roster = internalAction({
  args: runArgs,
  returns: v.boolean(),
  handler: async (ctx, { runId }): Promise<boolean> => {
    try {
      if (await ctx.runQuery(internal.abekaSync.renewalRequested, { runId }))
        await renew(ctx, runId);
      const report = await withSession(ctx, runId, (c) => c.roster());
      if (
        !(await ctx.runMutation(internal.abekaSync.identifySchool, {
          runId,
          externalSchoolId: report.externalSchoolId,
          externalSchoolName: report.externalSchoolName,
          unavailableStudents: report.unavailableStudents,
        }))
      )
        return false;
      for (let i = 0; i < report.students.length; i += 50) {
        if (
          !(await ctx.runMutation(internal.abekaSync.saveRosterBatch, {
            runId,
            students: report.students.slice(i, i + 50),
          }))
        )
          return false;
      }
      return await ctx.runMutation(internal.abekaSync.commitRoster, { runId });
    } catch (error) {
      await recordFailure(ctx, runId, error);
      return false;
    }
  },
});

export const subjects = internalAction({
  args: { ...runArgs, studentId: v.id("abekaStudents") },
  returns: v.union(
    v.null(),
    v.object({ skip: v.boolean(), ids: v.array(v.string()) }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<{ skip: boolean; ids: string[] } | null> => {
    try {
      const student = await ctx.runQuery(
        internal.abekaSync.studentContext,
        args,
      );
      if (!student) return { skip: true, ids: [] };
      const subjects = await withSession(ctx, args.runId, (c) =>
        c.subjects(student.loginId),
      );
      return { skip: false, ids: subjects.map((s) => s.id) };
    } catch (error) {
      await recordFailure(ctx, args.runId, error);
      return null;
    }
  },
});

export const progress = internalAction({
  args: { ...runArgs, studentId: v.id("abekaStudents"), subjectId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    try {
      const student = await ctx.runQuery(internal.abekaSync.studentContext, {
        runId: args.runId,
        studentId: args.studentId,
      });
      if (!student) return true;
      const lessons = await withSession(ctx, args.runId, (c) =>
        c.progress(student.loginId, args.subjectId),
      );
      return await ctx.runMutation(internal.abekaSync.saveProgress, {
        ...args,
        lessons,
      });
    } catch (error) {
      await recordFailure(ctx, args.runId, error);
      return false;
    }
  },
});
