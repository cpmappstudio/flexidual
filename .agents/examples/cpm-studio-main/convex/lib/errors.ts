import { ConvexError } from "convex/values";

export function throwAppError(code: string): never {
  throw new ConvexError({ code });
}
