"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";
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
import { Button, buttonVariants } from "@/components/ui/button";
import { ClassroomLayoutSidebar } from "@/components/classroom/classroom-layout";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { useOrgBasePath } from "@/hooks/use-org-base-path";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useMutation } from "convex/react";
import {
  Archive,
  ChevronRight,
  LoaderCircle,
  Settings2,
  Trash2,
  UserRound,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

export interface CourseChatParticipant {
  _id: Id<"users">;
  fullName: string;
  imageUrl?: string;
  role: "teacher" | "tutor" | "student";
  isMuted: boolean;
}

interface CourseChatParticipantsProps {
  classId: Id<"classes">;
  participants: CourseChatParticipant[];
  isOpen: boolean;
  canModerate: boolean;
  canDisableChat: boolean;
  chatSettings: {
    studentsMuted: boolean;
    disabled: boolean;
  };
}

const panelTabTriggerClassName =
  "relative h-full min-w-0 rounded-none text-xs font-medium text-muted-foreground shadow-none hover:bg-muted/60 hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-transparent data-[state=active]:after:bg-primary";

function ParticipantRow({
  participant,
}: {
  participant: CourseChatParticipant;
}) {
  const t = useTranslations("classroom");

  return (
    <>
      <Avatar className="size-9 shrink-0">
        <AvatarImage src={participant.imageUrl} alt={participant.fullName} />
        <AvatarFallback>
          {participant.fullName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium leading-snug whitespace-normal">
          {participant.fullName}
        </p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>{t(participant.role)}</span>
          {participant.isMuted ? (
            <>
              <span aria-hidden="true">·</span>
              <VolumeX className="size-3" aria-hidden="true" />
              <span>{t("chatMutedStatus")}</span>
            </>
          ) : null}
        </p>
      </div>
    </>
  );
}

function ParticipantActionMenus({
  classId,
  participant,
}: {
  classId: Id<"classes">;
  participant: CourseChatParticipant;
}) {
  const t = useTranslations("classroom");
  const router = useRouter();
  const basePath = useOrgBasePath();
  const setMuted = useMutation(api.courseChatMessages.setMuted);
  const [isUpdating, setIsUpdating] = useState(false);
  const MuteIcon = participant.isMuted ? Volume2 : VolumeX;
  const muteLabel = participant.isMuted ? t("unmuteStudent") : t("muteStudent");

  const handleViewProfile = () => {
    router.push(`${basePath}/students/${participant._id}`);
  };

  const handleToggleMute = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await setMuted({
        classId,
        userId: participant._id,
        muted: !participant.isMuted,
      });
      toast.success(
        participant.isMuted ? t("studentUnmuted") : t("studentMuted"),
      );
    } catch {
      toast.error(t("participantActionError"));
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full min-w-0 items-start gap-3 rounded-lg px-2 py-2 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("participantActions", {
                  name: participant.fullName,
                })}
              >
                <ParticipantRow participant={participant} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuItem onSelect={handleViewProfile}>
                <UserRound />
                {t("viewStudentProfile")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isUpdating}
                onSelect={() => void handleToggleMute()}
              >
                {isUpdating ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <MuteIcon />
                )}
                {muteLabel}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        <ContextMenuItem onSelect={handleViewProfile}>
          <UserRound />
          {t("viewStudentProfile")}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={isUpdating}
          onSelect={() => void handleToggleMute()}
        >
          {isUpdating ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <MuteIcon />
          )}
          {muteLabel}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ParticipantList({
  classId,
  participants,
  canModerate,
}: {
  classId: Id<"classes">;
  participants: CourseChatParticipant[];
  canModerate: boolean;
}) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-1 p-2">
        {participants.map((participant) =>
          canModerate && participant.role === "student" ? (
            <ParticipantActionMenus
              key={participant._id}
              classId={classId}
              participant={participant}
            />
          ) : (
            <div
              key={participant._id}
              className="flex min-w-0 items-start gap-3 rounded-lg px-2 py-2"
            >
              <ParticipantRow participant={participant} />
            </div>
          ),
        )}
      </div>
    </ScrollArea>
  );
}

function ParticipantAvatars({
  participants,
}: {
  participants: CourseChatParticipant[];
}) {
  const visible = participants.slice(0, 5);
  const remaining = participants.length - visible.length;

  return (
    <AvatarGroup aria-hidden="true">
      {visible.map((participant) => (
        <Avatar key={participant._id} size="sm">
          <AvatarImage src={participant.imageUrl} alt="" />
          <AvatarFallback>
            {participant.fullName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      ))}
      {remaining > 0 && (
        <AvatarGroupCount className="text-[10px]">
          +{remaining}
        </AvatarGroupCount>
      )}
    </AvatarGroup>
  );
}

function ChatSettingsPanel({
  classId,
  canDisableChat,
  settings,
}: {
  classId: Id<"classes">;
  canDisableChat: boolean;
  settings: CourseChatParticipantsProps["chatSettings"];
}) {
  const t = useTranslations("classroom");
  const commonT = useTranslations("common");
  const setSetting = useMutation(api.courseChatMessages.setSetting);
  const clearChat = useMutation(api.courseChatMessages.clear);
  const setArchived = useMutation(api.courseChatMessages.setArchived);
  const router = useRouter();
  const basePath = useOrgBasePath();
  const id = useId();
  const muteStudentsId = `${id}-mute-students`;
  const disableChatId = `${id}-disable-chat`;
  const [pendingSetting, setPendingSetting] = useState<
    "studentsMuted" | "disabled"
  >();
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const updateSetting = async (
    setting: "studentsMuted" | "disabled",
    enabled: boolean,
  ) => {
    if (pendingSetting) return;
    setPendingSetting(setting);
    try {
      await setSetting({ classId, setting, enabled });
    } catch {
      toast.error(t("chatSettingsError"));
    } finally {
      setPendingSetting(undefined);
    }
  };

  const handleClearChat = async () => {
    if (isClearing) return;
    setIsClearing(true);
    try {
      await clearChat({ classId });
      setIsClearDialogOpen(false);
      toast.success(t("chatCleared"));
    } catch {
      toast.error(t("clearChatError"));
    } finally {
      setIsClearing(false);
    }
  };

  const handleArchiveChat = async () => {
    if (isArchiving) return;
    setIsArchiving(true);
    try {
      await setArchived({ classId, archived: true });
      toast.success(t("chatArchived"));
      router.replace(basePath);
    } catch {
      toast.error(t("archiveChatError"));
      setIsArchiving(false);
    }
  };

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="divide-y divide-border/70 px-3">
          <div className="flex items-start justify-between gap-4 py-4">
            <Label htmlFor={muteStudentsId} className="cursor-pointer text-sm">
              {t("muteAllStudents")}
            </Label>
            <Switch
              id={muteStudentsId}
              checked={settings.studentsMuted}
              disabled={pendingSetting !== undefined}
              onCheckedChange={(checked) =>
                void updateSetting("studentsMuted", checked)
              }
            />
          </div>

          {canDisableChat ? (
            <>
              <div className="flex items-start justify-between gap-4 py-4">
                <Label
                  htmlFor={disableChatId}
                  className="cursor-pointer text-sm"
                >
                  {t("disableCourseChat")}
                </Label>
                <Switch
                  id={disableChatId}
                  checked={settings.disabled}
                  disabled={pendingSetting !== undefined}
                  onCheckedChange={(checked) =>
                    void updateSetting("disabled", checked)
                  }
                />
              </div>

              <AlertDialog
                open={isClearDialogOpen}
                onOpenChange={setIsClearDialogOpen}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start gap-3 px-0 py-4 text-left text-destructive hover:bg-transparent hover:text-destructive/80"
                  >
                    <Trash2 className="size-4 shrink-0" />
                    <span className="text-sm font-medium">
                      {t("clearChat")}
                    </span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="sm:max-w-sm">
                  <AlertDialogHeader className="items-center text-center sm:items-center sm:text-center">
                    <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                      <Trash2 className="size-5" />
                    </div>
                    <AlertDialogTitle>{t("clearChatTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("clearChatConfirmation")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="items-center justify-center sm:justify-center">
                    <AlertDialogCancel disabled={isClearing}>
                      {commonT("cancel")}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      disabled={isClearing}
                      className={buttonVariants({ variant: "destructive" })}
                      onClick={(event) => {
                        event.preventDefault();
                        void handleClearChat();
                      }}
                    >
                      {isClearing ? (
                        <LoaderCircle className="animate-spin" />
                      ) : null}
                      {t("clearChat")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button
                type="button"
                variant="ghost"
                disabled={isArchiving}
                className="h-auto w-full justify-start gap-3 px-0 py-4 text-destructive hover:bg-transparent hover:text-destructive/80"
                onClick={() => void handleArchiveChat()}
              >
                {isArchiving ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Archive className="size-4" />
                )}
                <span className="text-sm font-medium">{t("archiveChat")}</span>
              </Button>
            </>
          ) : null}
        </div>
      </ScrollArea>
    </>
  );
}

function CourseChatPanelContent({
  classId,
  participants,
  canModerate,
  canDisableChat,
  chatSettings,
}: Omit<CourseChatParticipantsProps, "isOpen">) {
  const t = useTranslations("classroom");

  if (!canModerate) {
    return (
      <>
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/70 px-3 xl:h-[var(--classroom-header-height)]">
          <Users className="size-4 text-primary" />
          <h2 className="truncate text-xs font-bold uppercase tracking-widest">
            {t("participants")}
          </h2>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {participants.length}
          </span>
        </div>
        <ParticipantList
          classId={classId}
          participants={participants}
          canModerate={false}
        />
      </>
    );
  }

  return (
    <Tabs defaultValue="participants" className="h-full min-h-0 gap-0">
      <TabsList className="h-12 w-full shrink-0 rounded-none border-b border-border/70 bg-transparent p-0 text-foreground xl:h-[var(--classroom-header-height)]">
        <TabsTrigger value="participants" className={panelTabTriggerClassName}>
          <Users />
          <span className="truncate">{t("participants")}</span>
          <span className="tabular-nums text-muted-foreground">
            {participants.length}
          </span>
        </TabsTrigger>
        <TabsTrigger value="settings" className={panelTabTriggerClassName}>
          <Settings2 />
          <span className="truncate">{t("chatSettings")}</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="participants"
        className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <ParticipantList
          classId={classId}
          participants={participants}
          canModerate
        />
      </TabsContent>
      <TabsContent
        value="settings"
        className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <ChatSettingsPanel
          classId={classId}
          canDisableChat={canDisableChat}
          settings={chatSettings}
        />
      </TabsContent>
    </Tabs>
  );
}

export function CourseChatParticipants({
  classId,
  participants,
  isOpen,
  canModerate,
  canDisableChat,
  chatSettings,
}: CourseChatParticipantsProps) {
  const t = useTranslations("classroom");
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const participantLabel = t("courseParticipantsCount", {
    count: participants.length,
  });

  return (
    <>
      <ClassroomLayoutSidebar
        id="course-chat-participants"
        className={cn(!isOpen && "xl:hidden")}
      >
        <button
          type="button"
          className="flex h-full min-w-0 items-center gap-2 px-3 text-left text-primary outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring xl:hidden"
          aria-label={participantLabel}
          onClick={() => setIsMobileOpen(true)}
        >
          <Users className="size-4 shrink-0" />
          <span className="truncate text-xs font-bold uppercase tracking-widest">
            {t("participants")}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <ParticipantAvatars participants={participants} />
            <ChevronRight className="size-4" />
          </span>
        </button>

        <div className="hidden min-h-0 flex-1 flex-col xl:flex">
          <CourseChatPanelContent
            classId={classId}
            participants={participants}
            canModerate={canModerate}
            canDisableChat={canDisableChat}
            chatSettings={chatSettings}
          />
        </div>
      </ClassroomLayoutSidebar>

      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetContent
          side="right"
          className="w-[min(92vw,24rem)] gap-0 p-0 sm:max-w-sm xl:hidden"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t("participants")}</SheetTitle>
            <SheetDescription>{participantLabel}</SheetDescription>
          </SheetHeader>
          <CourseChatPanelContent
            classId={classId}
            participants={participants}
            canModerate={canModerate}
            canDisableChat={canDisableChat}
            chatSettings={chatSettings}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
