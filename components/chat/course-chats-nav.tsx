"use client";

import Image from "next/image";
import { Link, usePathname } from "@/i18n/navigation";
import { useOrgBasePath } from "@/hooks/use-org-base-path";
import { useStaffAccess } from "@/hooks/use-staff-access";
import { api } from "@/convex/_generated/api";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { CurriculumIcon } from "@/components/teaching/curriculums/curriculum-icon";
import { Button } from "@/components/ui/button";
import {
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { ArchiveRestore, LoaderCircle, Search } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";
import { UnreadIndicator } from "@/components/notifications/unread-indicator";

export function CourseChatsNav({
  unreadChats,
  unreadEventChats = new Map(),
}: {
  unreadChats: ReadonlyMap<Id<"classes">, number>;
  unreadEventChats?: ReadonlyMap<Id<"events">, number>;
}) {
  const t = useTranslations("navigation");
  const eventT = useTranslations("events");
  const notificationT = useTranslations("systemNotifications");
  const pathname = usePathname();
  const basePath = useOrgBasePath();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { isAuthenticated } = useConvexAuth();
  const { access } = useStaffAccess();
  const setArchived = useMutation(api.courseChatMessages.setArchived);
  const setEventArchived = useMutation(api.eventChatMessages.setArchived);
  const [restoringId, setRestoringId] = useState<string>();
  const [search, setSearch] = useState("");
  useEffect(() => setSearch(""), [orgSlug]);
  const orgContext = useQuery(
    api.organizations.resolveSlug,
    isAuthenticated ? { slug: orgSlug } : "skip",
  );
  const chats = useQuery(
    api.classes.listChatOptions,
    !isAuthenticated || !orgContext
      ? "skip"
      : orgContext.type === "campus"
        ? { campusId: orgContext._id }
        : orgContext.type === "school"
          ? { schoolId: orgContext._id }
          : {},
  );
  const campus = useQuery(
    api.campuses.get,
    orgContext?.type === "campus" ? { id: orgContext._id } : "skip",
  );
  const eventSchoolId =
    orgContext?.type === "school"
      ? orgContext._id
      : orgContext?.type === "campus"
        ? campus?.schoolId
        : undefined;
  const eventOptions = usePaginatedQuery(
    api.eventChatContext.listOptions,
    isAuthenticated && eventSchoolId
      ? {
          schoolId: eventSchoolId,
          ...(orgContext?.type === "campus"
            ? { campusId: orgContext._id }
            : {}),
        }
      : "skip",
    { initialNumItems: 50 },
  );
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const eventChats = [
    ...new Map(
      eventOptions.results.map((item) => [item.eventId, item]),
    ).values(),
  ].filter((item) => item.title.toLocaleLowerCase().includes(normalizedSearch));
  const { activeChats, archivedChats } = useMemo(() => {
    const activeChats: NonNullable<typeof chats> = [];
    const archivedChats: NonNullable<typeof chats> = [];
    for (const chat of chats ?? []) {
      if (!chat.name.toLocaleLowerCase().includes(normalizedSearch)) continue;
      (chat.archived ? archivedChats : activeChats).push(chat);
    }
    return { activeChats, archivedChats };
  }, [chats, normalizedSearch]);
  const canRestoreChats = access?.canManageCampus ?? false;

  const restoreChat = async (
    classId: (typeof archivedChats)[number]["_id"],
  ) => {
    if (restoringId) return;
    setRestoringId(classId);
    try {
      await setArchived({ classId, archived: false });
      toast.success(t("chatRestored"));
    } catch {
      toast.error(t("restoreChatError"));
    } finally {
      setRestoringId(undefined);
    }
  };

  return (
    <>
      <SidebarGroup>
        <InputGroup className="mb-2 bg-background group-data-[collapsible=icon]:hidden">
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchChats")}
            aria-label={t("searchChats")}
          />
        </InputGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {chats === undefined ? (
              Array.from({ length: 3 }, (_, index) => (
                <SidebarMenuSkeleton key={index} showIcon />
              ))
            ) : activeChats.length === 0 &&
              archivedChats.length === 0 &&
              eventChats.length === 0 ? (
              <li className="px-2 py-3 text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
                {t(normalizedSearch ? "noMatchingChats" : "noChats")}
              </li>
            ) : (
              activeChats.map((course) => {
                const href = `${basePath}/chats/${course._id}`;
                return (
                  <SidebarMenuItem key={course._id}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === href}
                      tooltip={course.name}
                      aria-label={course.name}
                      className="h-11 gap-3 px-2 text-sm group-data-[collapsible=icon]:p-1!"
                    >
                      <Link href={href}>
                        <span className="relative shrink-0">
                          <CurriculumIcon
                            iconKey={course.curriculumIconKey}
                            className="size-7"
                            size={28}
                          />
                          <UnreadIndicator
                            count={unreadChats.get(course._id) ?? 0}
                            dot
                            label={notificationT("unreadMessages", {
                              count: unreadChats.get(course._id) ?? 0,
                            })}
                          />
                        </span>
                        <span>{course.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {archivedChats.length > 0 ? (
        <SidebarGroup>
          <SidebarGroupLabel>{t("archivedChats")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {archivedChats.map((course) => (
                <SidebarMenuItem key={course._id}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton
                        tooltip={course.name}
                        aria-label={course.name}
                        className="h-11 gap-3 px-2 text-sm opacity-60 group-data-[collapsible=icon]:p-1!"
                      >
                        <CurriculumIcon
                          iconKey={course.curriculumIconKey}
                          className="size-7 grayscale"
                          size={28}
                        />
                        <span>{course.name}</span>
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start">
                      <DropdownMenuItem
                        disabled={!canRestoreChats || restoringId !== undefined}
                        onSelect={() => void restoreChat(course._id)}
                      >
                        {restoringId === course._id ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <ArchiveRestore />
                        )}
                        {t("unarchiveChat")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}

      {eventChats.some((item) => !item.archived) && (
        <SidebarGroup>
          <SidebarGroupLabel>{eventT("name")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {eventChats
                .filter((item) => !item.archived)
                .map((item) => {
                  const href = `${basePath}/chats/events/${item.eventId}`;
                  const count = unreadEventChats.get(item.eventId) ?? 0;
                  return (
                    <SidebarMenuItem key={item.eventId}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname === href}
                        tooltip={item.title}
                        aria-label={item.title}
                        className="h-11 gap-3 px-2 text-sm group-data-[collapsible=icon]:p-1!"
                      >
                        <Link href={href}>
                          <span className="relative shrink-0">
                            <Image
                              src="/event-calendar-star.svg"
                              alt=""
                              width={28}
                              height={28}
                              className="size-7"
                              aria-hidden="true"
                            />
                            <UnreadIndicator
                              count={count}
                              dot
                              label={notificationT("unreadMessages", { count })}
                            />
                          </span>
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}

      {eventChats.some((item) => item.archived) && (
        <SidebarGroup>
          <SidebarGroupLabel>
            {t("archivedChats")}: {eventT("name")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {eventChats
                .filter((item) => item.archived)
                .map((item) => (
                  <SidebarMenuItem key={item.eventId}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                          tooltip={item.title}
                          aria-label={item.title}
                          className="h-11 gap-3 px-2 text-sm opacity-60"
                        >
                          <Image
                            src="/event-calendar-star.svg"
                            alt=""
                            width={28}
                            height={28}
                            className="size-7"
                            aria-hidden="true"
                          />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" align="start">
                        <DropdownMenuItem
                          disabled={
                            !item.canRestore || restoringId !== undefined
                          }
                          onSelect={() => {
                            setRestoringId(item.eventId);
                            void setEventArchived({
                              eventId: item.eventId,
                              archived: false,
                            })
                              .then(() => toast.success(t("chatRestored")))
                              .catch(() => toast.error(t("restoreChatError")))
                              .finally(() => setRestoringId(undefined));
                          }}
                        >
                          <ArchiveRestore />
                          {t("unarchiveChat")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}

      {eventOptions.status === "CanLoadMore" && (
        <SidebarGroup>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => eventOptions.loadMore(50)}
          >
            {eventT("loadMore")}
          </Button>
        </SidebarGroup>
      )}
    </>
  );
}
