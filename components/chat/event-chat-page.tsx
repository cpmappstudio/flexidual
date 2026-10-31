"use client";

import { useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClassroomHeader } from "@/components/classroom/classroom-header";
import {
  ClassroomLayout,
  ClassroomLayoutControls,
  ClassroomLayoutStage,
} from "@/components/classroom/classroom-layout";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/navigation/routes";
import { CourseChatPins } from "./course-chat-pins";
import { EventChatComposer, EventChatMessages } from "./course-chat";
import { CourseChatUploadProvider } from "./course-chat-pending";
import { EventChatPanel } from "./event-chat-panel";

export function EventChatPage({ eventId }: { eventId: Id<"events"> }) {
  const t = useTranslations("classroom");
  const eventT = useTranslations("events");
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { isAuthenticated } = useConvexAuth();
  const [panelOpen, setPanelOpen] = useState(true);
  const context = useQuery(
    api.eventChatContext.get,
    isAuthenticated ? { eventId } : "skip",
  );
  if (context === undefined)
    return (
      <main data-classroom-layout className="h-full w-full">
        <Skeleton className="size-full rounded-none" />
      </main>
    );
  if (!context)
    return (
      <main
        data-classroom-layout
        className="flex h-full items-center justify-center text-sm text-muted-foreground"
      >
        {eventT("chatNotFound")}
      </main>
    );
  return (
    <main
      data-classroom-layout
      className="h-full min-h-0 w-full overflow-hidden"
    >
      <CourseChatUploadProvider key={eventId}>
        <ClassroomLayout isSidebarOpen={panelOpen}>
          <ClassroomHeader
            title={context.title}
            subtitle={eventT("name")}
            isActive={false}
            activeLabel={eventT("chat")}
            waitingLabel={eventT("chat")}
            isRecording={false}
            isPhoneLandscape={false}
            isPanelOpen={panelOpen}
            openPanelLabel={t("openParticipantsPanel")}
            closePanelLabel={t("closeParticipantsPanel")}
            onPanelOpenChange={setPanelOpen}
            action={
              <div className="flex items-center gap-1">
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  aria-label={eventT("viewEvent")}
                >
                  <Link href={ROUTES.org.events.detail(orgSlug, eventId)}>
                    <Image
                      src="/event-calendar-star.svg"
                      alt=""
                      width={20}
                      height={20}
                      className="size-5"
                      aria-hidden="true"
                    />
                  </Link>
                </Button>
                <CourseChatPins eventId={eventId} />
              </div>
            }
          />
          <ClassroomLayoutStage>
            <EventChatMessages eventId={eventId} />
          </ClassroomLayoutStage>
          <ClassroomLayoutControls>
            <EventChatComposer eventId={eventId} />
          </ClassroomLayoutControls>
          <EventChatPanel
            eventId={eventId}
            context={context}
            isOpen={panelOpen}
          />
        </ClassroomLayout>
      </CourseChatUploadProvider>
    </main>
  );
}
