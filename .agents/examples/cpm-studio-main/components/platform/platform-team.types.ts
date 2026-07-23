import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";

export type PlatformTeamRole = "superadmin" | "viewer";

export type PlatformTeamMember = FunctionReturnType<
  typeof api.platform.team.listMembersForPlatform
>["page"][number];

export type PlatformTeamInvite = FunctionReturnType<
  typeof api.platform.invitations.listForPlatform
>["page"][number];
