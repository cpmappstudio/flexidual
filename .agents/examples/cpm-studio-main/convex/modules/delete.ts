import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  deleteLiveClassRowsBatch,
  deleteLiveClassRowsForOrganizationPersonBatch,
} from "./liveClasses/lib/delete";

export async function deleteBusinessModuleRowsBatch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  batchSize: number,
) {
  return await deleteLiveClassRowsBatch(ctx, organizationId, batchSize);
}

export async function deleteBusinessModuleRowsForOrganizationPersonBatch(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    batchSize: number;
  },
) {
  return await deleteLiveClassRowsForOrganizationPersonBatch(ctx, args);
}
