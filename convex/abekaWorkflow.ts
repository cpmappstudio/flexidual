import { defineWorkflow } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { runArgs } from "./abekaSync";
import type { Id } from "./_generated/dataModel";
import { ABEKA_REQUEST_INTERVAL_MS } from "../lib/abeka/request-policy";
import {
  mergeCatalogSubjects,
  type CatalogSubject,
} from "../lib/abeka/catalog";

// Normal spacing is scheduled durably, not spent sleeping inside an action.
// The transport gate also enforces the shared rate across concurrent workflows.
const requestOptions = { retry: false, runAfter: ABEKA_REQUEST_INTERVAL_MS };

export const catalog = defineWorkflow(components.workflow, {
  args: runArgs,
  returns: v.null(),
}).handler(async (step, { runId }): Promise<null> => {
  const groups = await step.runAction(
    internal.abekaActions.catalogGroups,
    { runId },
    requestOptions,
  );
  if (!groups) return null;
  let subjects: CatalogSubject[] = [];
  for (const groupId of groups) {
    const grades = await step.runAction(
      internal.abekaActions.catalogGrades,
      { runId, groupId },
      requestOptions,
    );
    if (!grades) return null;
    for (const grade of grades) {
      const rows = await step.runAction(
        internal.abekaActions.catalogSubjects,
        { runId, groupId, grade },
        requestOptions,
      );
      if (!rows) return null;
      subjects = mergeCatalogSubjects([...subjects, ...rows]);
    }
  }
  // ponytail: bounded catalog (500 subjects); one atomic commit, no staging tables.
  await step.runMutation(internal.abekaCatalog.commit, { runId, subjects });
  return null;
});

export const sync = defineWorkflow(components.workflow, {
  args: { ...runArgs, studentId: v.optional(v.id("abekaStudents")) },
  returns: v.null(),
}).handler(async (step, { runId, studentId }): Promise<null> => {
  if (
    !studentId &&
    !(await step.runAction(
      internal.abekaActions.roster,
      { runId },
      requestOptions,
    ))
  )
    return null;
  let cursor: string | null = null;
  for (;;) {
    const page: {
      page: Id<"abekaStudents">[];
      continueCursor: string;
      isDone: boolean;
    } = await step.runQuery(internal.abekaSync.studentPage, {
      runId,
      paginationOpts: { cursor, numItems: 20 },
    });
    for (const studentId of page.page) {
      const subjects = await step.runAction(
        internal.abekaActions.subjects,
        {
          runId,
          studentId,
        },
        requestOptions,
      );
      if (subjects === null) return null;
      if (subjects.skip) continue;
      for (const subjectId of subjects.ids) {
        if (
          !(await step.runAction(
            internal.abekaActions.progress,
            {
              runId,
              studentId,
              subjectId,
            },
            requestOptions,
          ))
        )
          return null;
      }
      await step.runMutation(internal.abekaSync.studentComplete, {
        runId,
        studentId,
        subjectIds: subjects.ids,
      });
    }
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  return null;
});
