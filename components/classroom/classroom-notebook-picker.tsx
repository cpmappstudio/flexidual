"use client";
import { useRoomContext } from "@livekit/components-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { NotebookPagePicker } from "@/components/whiteboard/notebook-page-picker";
import type { ComponentProps } from "react";

export function ClassroomNotebookPicker({
  classId,
  roomName,
  children,
}: {
  classId: Id<"classes">;
  roomName: string;
  children: ComponentProps<typeof NotebookPagePicker>["children"];
}) {
  const room = useRoomContext();
  const select = useMutation(api.whiteboardSessions.selectNotebookPage);
  async function present(pageId: Id<"courseNotebookPages">) {
    await select({ roomName, expectedLiveRoomName: room.name, pageId });
  }
  return (
    <NotebookPagePicker classId={classId} onSelectPage={present}>
      {children}
    </NotebookPagePicker>
  );
}
