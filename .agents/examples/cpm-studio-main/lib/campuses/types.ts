import type { Id } from "@/convex/_generated/dataModel";

export type TenantCampusRecord = {
  _id: Id<"campuses">;
  _creationTime: number;
  organizationId: Id<"organizations">;
  name: string;
  slug: string;
  imageUrl?: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};
