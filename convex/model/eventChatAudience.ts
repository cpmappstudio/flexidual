import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DbCtx = QueryCtx | MutationCtx;
type Cursor = { sourceIndex: number; cursor: string | null };

export async function pageEventAudienceAssignments(
  ctx: DbCtx,
  event: Pick<Doc<"events">, "schoolId" | "campusId">,
  position: Cursor,
  pageSize: number,
) {
  const campuses = event.campusId
    ? [event.campusId]
    : (
        await ctx.db
          .query("campuses")
          .withIndex("by_school", (q) => q.eq("schoolId", event.schoolId))
          .collect()
      ).map((campus) => campus._id);
  const sources: Array<{
    orgId?: string;
    orgType: "school" | "campus" | "system";
  }> = [
    { orgId: event.schoolId, orgType: "school" },
    ...campuses.map((campusId) => ({
      orgId: campusId,
      orgType: "campus" as const,
    })),
    { orgType: "system" },
  ];
  const source = sources[position.sourceIndex];
  if (!source) return { rows: [], next: null };
  const page = await ctx.db
    .query("roleAssignments")
    .withIndex("by_org", (q) =>
      q.eq("orgId", source.orgId).eq("orgType", source.orgType),
    )
    .paginate({
      cursor: position.cursor,
      numItems: pageSize,
      maximumRowsRead: pageSize,
    });
  const next: Cursor | null = page.isDone
    ? position.sourceIndex + 1 < sources.length
      ? { sourceIndex: position.sourceIndex + 1, cursor: null }
      : null
    : { sourceIndex: position.sourceIndex, cursor: page.continueCursor };
  return { rows: page.page, next };
}
