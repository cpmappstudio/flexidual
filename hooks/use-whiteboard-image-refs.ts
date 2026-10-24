"use client";
import { useMemo } from "react";
import { useQueries } from "convex/react";
import {
  getFunctionName,
  makeFunctionReference,
  type FunctionReference,
} from "convex/server";
import type { WhiteboardFileRefs } from "@/lib/whiteboard-draft-storage";
import type { WhiteboardElement } from "@/lib/whiteboard-elements";

/** Only visible image references, in bounded groups shared by notebook and live readers. */
export function useWhiteboardImageRefs(
  elements: readonly WhiteboardElement[] | undefined,
  query: FunctionReference<"query">,
  args: Record<string, string>,
) {
  const idsKey = JSON.stringify(
    [
      ...new Set(
        (elements ?? []).flatMap((element) =>
          element.type === "image" &&
          !element.isDeleted &&
          typeof element.fileId === "string"
            ? [element.fileId]
            : [],
        ),
      ),
    ].sort(),
  );
  const name = getFunctionName(query);
  const argsKey = JSON.stringify(args);
  const queries = useMemo(() => {
    const ids: string[] = JSON.parse(idsKey);
    return Object.fromEntries(
      Array.from({ length: Math.ceil(ids.length / 64) }, (_, index) => [
        String(index),
        {
          query: makeFunctionReference<"query">(name),
          args: {
            ...JSON.parse(argsKey),
            fileIds: ids.slice(index * 64, (index + 1) * 64),
          },
        },
      ]),
    );
  }, [idsKey, name, argsKey]);
  const files = useQueries(queries);
  return useMemo<WhiteboardFileRefs | undefined>(() => {
    if (elements === undefined) return undefined;
    for (const id of Object.keys(queries)) {
      if (files[id] instanceof Error) throw files[id];
      if (files[id] === undefined) return undefined;
    }
    return Object.fromEntries(
      Object.keys(queries).flatMap((id) => Object.entries(files[id])),
    );
  }, [elements, files, queries]);
}
