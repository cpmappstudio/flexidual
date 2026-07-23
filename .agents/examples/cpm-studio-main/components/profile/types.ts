import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";

export type ProfileCurrentUser = NonNullable<
  FunctionReturnType<typeof api.users.current>
>;
export type ProfileAvatarDraftSubject = Pick<
  ProfileCurrentUser,
  "firstName" | "lastName" | "name" | "email" | "image" | "avatarUrl" | "hasUploadedAvatar"
>;
export type ProfileSession = FunctionReturnType<
  typeof api.users.listMySessions
>[number];
