import { defineTable } from "convex/server";

export type ModuleTables = Record<string, ReturnType<typeof defineTable>>;

type UnionToIntersection<T> = (
  T extends unknown ? (value: T) => void : never
) extends (value: infer Intersection) => void
  ? Intersection
  : never;

export function defineModuleTables<T extends ModuleTables>(tables: T) {
  return tables;
}

export function composeModuleTables(
  ...modules: readonly []
): Record<never, never>;
export function composeModuleTables<const T extends readonly ModuleTables[]>(
  ...modules: T
): UnionToIntersection<T[number]>;
export function composeModuleTables(
  ...modules: readonly ModuleTables[]
) {
  return Object.assign({}, ...modules);
}
