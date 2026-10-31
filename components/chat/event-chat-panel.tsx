"use client";

import { useId, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Archive,
  ChevronRight,
  LoaderCircle,
  Settings2,
  Trash2,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClassroomLayoutSidebar } from "@/components/classroom/classroom-layout";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRouter } from "@/i18n/navigation";
import { ROUTES } from "@/lib/navigation/routes";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Context = NonNullable<FunctionReturnType<typeof api.eventChatContext.get>>;

export function EventChatPanel({
  eventId,
  context,
  isOpen,
}: {
  eventId: Id<"events">;
  context: Context;
  isOpen: boolean;
}) {
  const t = useTranslations("classroom");
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const content = <EventChatPanelContent eventId={eventId} context={context} />;
  return (
    <>
      <ClassroomLayoutSidebar
        id="event-chat-participants"
        className={cn(!isOpen && "xl:hidden")}
      >
        <button
          type="button"
          className="flex h-full items-center gap-2 px-3 text-left text-primary xl:hidden"
          onClick={() => setMobileOpen(true)}
        >
          <Users className="size-4" />
          {t("participants")}
          <ChevronRight className="ml-auto size-4" />
        </button>
        <div className="hidden min-h-0 flex-1 flex-col xl:flex">
          {isOpen && !isMobile && content}
        </div>
      </ClassroomLayoutSidebar>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="right"
          className="w-[min(92vw,24rem)] gap-0 p-0 sm:max-w-sm xl:hidden"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t("participants")}</SheetTitle>
            <SheetDescription>{context.title}</SheetDescription>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    </>
  );
}

function EventChatPanelContent({
  eventId,
  context,
}: {
  eventId: Id<"events">;
  context: Context;
}) {
  const t = useTranslations("classroom");
  return (
    <Tabs defaultValue="participants" className="h-full min-h-0 gap-0">
      {context.canModerate ? (
        <TabsList className="h-12 w-full shrink-0 rounded-none border-b bg-transparent p-0 xl:h-[var(--classroom-header-height)]">
          <TabsTrigger value="participants" className="flex-1">
            <Users />
            {t("participants")}
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex-1">
            <Settings2 />
            {t("chatSettings")}
          </TabsTrigger>
        </TabsList>
      ) : (
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3 text-xs font-bold uppercase tracking-widest text-primary xl:h-[var(--classroom-header-height)]">
          <Users className="size-4" />
          {t("participants")}
        </div>
      )}
      <TabsContent
        value="participants"
        className="m-0 min-h-0 flex-1 overflow-hidden"
      >
        <ScrollArea className="h-full">
          <AudiencePage
            eventId={eventId}
            canModerate={context.canModerate}
            cursor={null}
            seen={new Set()}
          />
        </ScrollArea>
      </TabsContent>
      {context.canModerate && (
        <TabsContent
          value="settings"
          className="m-0 min-h-0 flex-1 overflow-hidden"
        >
          <ScrollArea className="h-full">
            <EventChatSettings eventId={eventId} context={context} />
          </ScrollArea>
        </TabsContent>
      )}
    </Tabs>
  );
}

function AudiencePage({
  eventId,
  canModerate,
  cursor,
  seen,
}: {
  eventId: Id<"events">;
  canModerate: boolean;
  cursor: string | null;
  seen: Set<string>;
}) {
  const t = useTranslations("classroom");
  const eventT = useTranslations("events");
  const [expanded, setExpanded] = useState(false);
  const setMuted = useMutation(api.eventChatMessages.setMuted);
  const [updating, setUpdating] = useState<string>();
  const result = useQuery(api.eventChatContext.listParticipants, {
    eventId,
    ...(cursor ? { cursor } : {}),
  });
  const unique = result?.page.filter((person) => !seen.has(person._id)) ?? [];
  const nextSeen = new Set([...seen, ...unique.map((person) => person._id)]);
  async function toggle(userId: Id<"users">, muted: boolean) {
    setUpdating(userId);
    try {
      await setMuted({ eventId, userId, muted: !muted });
    } catch {
      toast.error(t("participantActionError"));
    } finally {
      setUpdating(undefined);
    }
  }
  return (
    <div className="space-y-1 p-2">
      {unique.map((person) => (
        <div
          key={person._id}
          className="flex items-center gap-2 rounded-lg px-2 py-2"
        >
          <Avatar className="size-9 shrink-0">
            <AvatarImage src={person.imageUrl} alt={person.fullName} />
            <AvatarFallback>{person.fullName.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{person.fullName}</p>
            <p className="text-xs text-muted-foreground">
              {person.role === "teacher"
                ? t("teacher")
                : person.role === "student"
                  ? eventT("student")
                  : eventT("staff")}
              {person.isMuted ? ` · ${t("chatMutedStatus")}` : ""}
            </p>
          </div>
          {canModerate && person.role === "student" && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={updating === person._id}
              aria-label={
                person.isMuted ? t("unmuteStudent") : t("muteStudent")
              }
              onClick={() => void toggle(person._id, person.isMuted)}
            >
              {updating === person._id ? (
                <LoaderCircle className="animate-spin" />
              ) : person.isMuted ? (
                <Volume2 />
              ) : (
                <VolumeX />
              )}
            </Button>
          )}
        </div>
      ))}
      {result === undefined && (
        <LoaderCircle className="mx-auto size-4 animate-spin" />
      )}
      {result?.nextCursor && !expanded && (
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => setExpanded(true)}
        >
          {eventT("loadMore")}
        </Button>
      )}
      {expanded && result?.nextCursor && (
        <AudiencePage
          eventId={eventId}
          canModerate={canModerate}
          cursor={result.nextCursor}
          seen={nextSeen}
        />
      )}
    </div>
  );
}

function EventChatSettings({
  eventId,
  context,
}: {
  eventId: Id<"events">;
  context: Context;
}) {
  const t = useTranslations("classroom");
  const common = useTranslations("common");
  const eventT = useTranslations("events");
  const navigationT = useTranslations("navigation");
  const id = useId();
  const router = useRouter();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const setSetting = useMutation(api.eventChatMessages.setSetting);
  const clear = useMutation(api.eventChatMessages.clear);
  const setArchived = useMutation(api.eventChatMessages.setArchived);
  const [pending, setPending] = useState(false);
  async function update(
    setting: "studentsMuted" | "disabled" | "studentAttachmentsEnabled",
    enabled: boolean,
  ) {
    setPending(true);
    try {
      await setSetting({ eventId, setting, enabled });
    } catch {
      toast.error(t("chatSettingsError"));
    } finally {
      setPending(false);
    }
  }
  async function toggleArchive() {
    if (pending) return;
    setPending(true);
    const archived = !context.chatSettings.archived;
    try {
      await setArchived({ eventId, archived });
      toast.success(archived ? t("chatArchived") : navigationT("chatRestored"));
      if (archived) router.replace(ROUTES.org.events.detail(orgSlug, eventId));
    } catch {
      toast.error(
        archived ? t("archiveChatError") : navigationT("restoreChatError"),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="divide-y px-3">
      {(
        [
          [
            "studentsMuted",
            t("muteAllStudents"),
            context.chatSettings.studentsMuted,
          ],
          [
            "studentAttachmentsEnabled",
            t("studentAttachmentsEnabled"),
            context.chatSettings.studentAttachmentsEnabled,
          ],
          ...(context.canDisableChat
            ? [
                [
                  "disabled",
                  t("disableCourseChat"),
                  context.chatSettings.disabled,
                ] as const,
              ]
            : []),
        ] as Array<
          readonly [
            "studentsMuted" | "disabled" | "studentAttachmentsEnabled",
            string,
            boolean,
          ]
        >
      ).map(([setting, label, checked]) => (
        <div
          key={setting}
          className="flex items-center justify-between gap-3 py-4"
        >
          <Label htmlFor={`${id}-${setting}`}>{label}</Label>
          <Switch
            id={`${id}-${setting}`}
            checked={checked}
            disabled={pending || context.chatSettings.archived}
            onCheckedChange={(value) => void update(setting, value)}
          />
        </div>
      ))}
      {context.canDisableChat && (
        <>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                disabled={context.chatSettings.archived}
                className="h-auto w-full justify-start gap-3 px-0 py-4 text-destructive"
              >
                <Trash2 className="size-4" />
                {t("clearChat")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("clearChatTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("clearChatConfirmation")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{common("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  disabled={pending}
                  onClick={() =>
                    void clear({ eventId })
                      .then(() => toast.success(t("chatCleared")))
                      .catch(() => toast.error(t("clearChatError")))
                  }
                >
                  {t("clearChat")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            className="h-auto w-full justify-start gap-3 px-0 py-4 text-destructive"
            onClick={() => void toggleArchive()}
          >
            <Archive className="size-4" />
            {context.chatSettings.archived
              ? navigationT("unarchiveChat")
              : eventT("archiveChat")}
          </Button>
        </>
      )}
    </div>
  );
}
