"use client";

import { useState } from "react";
import { useConvexAuth, usePaginatedQuery, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CourseChatMessages, CourseChatComposer } from "./course-chat";
import { CourseChatParticipants } from "./course-chat-participants";
import { CourseChatPins } from "./course-chat-pins";
import { CourseChatUploadProvider } from "./course-chat-pending";
import { ClassroomHeader } from "@/components/classroom/classroom-header";
import {
  ClassroomLayout,
  ClassroomLayoutControls,
  ClassroomLayoutStage,
} from "@/components/classroom/classroom-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { UserRoundPen } from "lucide-react";
import dynamic from "next/dynamic";

const EditBroadcastParticipantsDialog = dynamic(() =>
  import("./edit-broadcast-participants-dialog").then(
    (module) => module.EditBroadcastParticipantsDialog,
  ),
);

export function BroadcastChatPage({
  broadcastId,
}: {
  broadcastId: Id<"broadcasts">;
}) {
  const { isAuthenticated } = useConvexAuth();
  const [participantsOpen, setParticipantsOpen] = useState(true);
  const [editingParticipants, setEditingParticipants] = useState(false);
  const t = useTranslations("classroom");
  const common = useTranslations("systemNotifications");
  const context = useQuery(
    api.broadcasts.context,
    isAuthenticated ? { broadcastId } : "skip",
  );
  const { results, status, loadMore } = usePaginatedQuery(
    api.broadcasts.participants,
    context && !context.archived && participantsOpen ? { broadcastId } : "skip",
    { initialNumItems: 40 },
  );
  const participants = [
    ...new Map(results.map((row) => [row._id, row])).values(),
  ];
  if (context === undefined)
    return <Skeleton className="size-full rounded-none" />;
  if (!context || context.archived)
    return (
      <main className="flex h-full items-center justify-center">
        {t("courseChatNotFound")}
      </main>
    );
  return (
    <main
      data-classroom-layout
      className="h-full min-h-0 w-full overflow-hidden"
    >
      <CourseChatUploadProvider key={broadcastId}>
        <ClassroomLayout isSidebarOpen={participantsOpen}>
          <ClassroomHeader
            title={context.name}
            subtitle={t("broadcasts.title")}
            isActive={false}
            activeLabel={t("broadcasts.title")}
            waitingLabel={t("broadcasts.title")}
            isRecording={false}
            isPhoneLandscape={false}
            isPanelOpen={participantsOpen}
            openPanelLabel={t("openParticipantsPanel")}
            closePanelLabel={t("closeParticipantsPanel")}
            onPanelOpenChange={setParticipantsOpen}
            action={<CourseChatPins broadcastId={broadcastId} />}
          />
          <ClassroomLayoutStage>
            <CourseChatMessages broadcastId={broadcastId} />
          </ClassroomLayoutStage>
          <ClassroomLayoutControls>
            <CourseChatComposer broadcastId={broadcastId} />
          </ClassroomLayoutControls>
          <CourseChatParticipants
            broadcastId={broadcastId}
            participants={participants}
            isOpen={participantsOpen}
            canModerate={context.canManage}
            canDisableChat={context.canManage}
            chatSettings={context.settings}
            footer={
              <>
                {context.canManage && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setEditingParticipants(true)}
                  >
                    <UserRoundPen />
                    {t("broadcasts.editParticipants")}
                  </Button>
                )}
                {(status === "CanLoadMore" || status === "LoadingMore") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={status === "LoadingMore"}
                    onClick={() => loadMore(40)}
                  >
                    {common("loadMore")}
                  </Button>
                )}
              </>
            }
          />
        </ClassroomLayout>
      </CourseChatUploadProvider>
      {editingParticipants && context.canManage && (
        <EditBroadcastParticipantsDialog
          key={`participants:${broadcastId}`}
          broadcastId={broadcastId}
          schoolId={context.schoolId}
          campusId={context.campusId}
          mode={context.mode}
          onClose={() => setEditingParticipants(false)}
        />
      )}
    </main>
  );
}
