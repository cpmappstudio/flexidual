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
import type { Id } from "@/convex/_generated/dataModel";
import {
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import {
  ArchiveRestore,
  LoaderCircle,
  Search,
  Plus,
  Megaphone,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { toast } from "sonner";
import type { FunctionReturnType } from "convex/server";
import { UnreadIndicator } from "@/components/notifications/unread-indicator";
import type { ChatTarget } from "@/convex/model/chatTarget";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
const NewBroadcastDialog = dynamic(() =>
  import("./new-broadcast-dialog").then((module) => module.NewBroadcastDialog),
);

export function CourseChatsNav({
  unreadChats,
  unreadEventChats = new Map(),
}: {
  unreadChats: ReadonlyMap<string, number>;
  unreadEventChats?: ReadonlyMap<Id<"events">, number>;
}) {
  const t = useTranslations("navigation");
  const eventT = useTranslations("events");
  const notificationT = useTranslations("systemNotifications");
  const broadcastT = useTranslations("classroom.broadcasts");
  const pathname = usePathname();
  const basePath = useOrgBasePath();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { isAuthenticated } = useConvexAuth();
  const { access } = useStaffAccess();
  const setEventArchived = useMutation(api.eventChatMessages.setArchived);
  const [restoringId, setRestoringId] = useState<string>();
  const [search, setSearch] = useState("");
  const [creatingBroadcast, setCreatingBroadcast] = useState(false);
  const scope = useQuery(
    api.broadcasts.scope,
    isAuthenticated ? { orgSlug } : "skip",
  );
  const [searchOrgSlug, setSearchOrgSlug] = useState(orgSlug);
  if (searchOrgSlug !== orgSlug) {
    setSearchOrgSlug(orgSlug);
    setSearch("");
    setCreatingBroadcast(false);
  }
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
  const broadcastSearch = useDebouncedValue(normalizedSearch, 200);
  const broadcastFeed = usePaginatedQuery(
    api.broadcasts.list,
    scope
      ? {
          schoolId: scope.schoolId,
          campusId: scope.campusId,
          search: broadcastSearch,
        }
      : "skip",
    { initialNumItems: 30 },
  );
  const broadcasts = broadcastFeed.results;
  const { status: broadcastStatus, loadMore: loadMoreBroadcasts } =
    broadcastFeed;
  useEffect(() => {
    if (scope && broadcasts.length === 0 && broadcastStatus === "CanLoadMore")
      loadMoreBroadcasts(30);
  }, [scope, broadcasts.length, broadcastStatus, loadMoreBroadcasts]);
  const activeChats: NonNullable<typeof chats> = [];
  const archivedChats: NonNullable<typeof chats> = [];
  for (const chat of chats ?? []) {
    if (!chat.name.toLocaleLowerCase().includes(normalizedSearch)) continue;
    (chat.archived ? archivedChats : activeChats).push(chat);
  }
  const canRestoreChats = access?.canManageCampus ?? false;

  return (
    <>
      <SidebarGroup>
        <div className="mb-2 flex items-center gap-2 group-data-[collapsible=icon]:hidden">
          <InputGroup className="min-w-0 flex-1 bg-background">
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
          {scope?.canCreate && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  className="shrink-0"
                  aria-label={broadcastT("new")}
                >
                  <Plus />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setCreatingBroadcast(true)}>
                  <Megaphone />
                  {broadcastT("new")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {scope && (
          <BroadcastChatsNav
            chats={broadcasts}
            status={broadcastFeed.status}
            loadMore={broadcastFeed.loadMore}
            unreadChats={unreadChats}
          />
        )}
        <SidebarGroupContent>
          <SidebarMenu>
            {chats === undefined ? (
              Array.from({ length: 3 }, (_, index) => (
                <SidebarMenuSkeleton key={index} showIcon />
              ))
            ) : activeChats.length === 0 &&
              archivedChats.length === 0 &&
              eventChats.length === 0 &&
              broadcasts.length === 0 &&
              (!scope || broadcastFeed.status === "Exhausted") ? (
              <li className="px-2 py-3 text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
                {t(normalizedSearch ? "noMatchingChats" : "noChats")}
              </li>
            ) : (
              activeChats.map((course) => {
                const href = `${basePath}/chats/${course._id}`;
                return (
                  <SidebarMenuItem key={course._id}>
                    <ChatNavLink
                      name={course.name}
                      href={href}
                      active={pathname === href}
                      unread={unreadChats.get(course._id) ?? 0}
                      icon={
                        <CurriculumIcon
                          iconKey={course.curriculumIconKey}
                          className="size-7"
                          size={28}
                        />
                      }
                    />
                  </SidebarMenuItem>
                );
              })
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {creatingBroadcast && scope && (
        <NewBroadcastDialog
          key={orgSlug}
          scope={scope}
          onClose={() => setCreatingBroadcast(false)}
        />
      )}

      {archivedChats.length > 0 ? (
        <SidebarGroup>
          <SidebarGroupLabel>{t("archivedChats")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {archivedChats.map((course) => (
                <SidebarMenuItem key={course._id}>
                  <ArchivedChatNavItem
                    name={course.name}
                    target={{ classId: course._id }}
                    canRestore={canRestoreChats}
                    icon={
                      <CurriculumIcon
                        iconKey={course.curriculumIconKey}
                        className="size-7 grayscale"
                        size={28}
                      />
                    }
                  />
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

function BroadcastChatsNav({
  chats,
  status,
  loadMore,
  unreadChats,
}: {
  chats: FunctionReturnType<typeof api.broadcasts.list>["page"];
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loadMore: (count: number) => void;
  unreadChats: ReadonlyMap<string, number>;
}) {
  const common = useTranslations("systemNotifications");
  const basePath = useOrgBasePath();
  const pathname = usePathname();
  return (
    <SidebarMenu>
      {chats.map((chat) => (
        <SidebarMenuItem key={chat._id}>
          {chat.archived ? (
            <ArchivedChatNavItem
              name={chat.name}
              target={{ broadcastId: chat._id }}
              canRestore={chat.canManage}
              icon={<Megaphone className="size-7" />}
            />
          ) : (
            <ChatNavLink
              name={chat.name}
              href={`${basePath}/chats/broadcasts/${chat._id}`}
              active={pathname === `${basePath}/chats/broadcasts/${chat._id}`}
              unread={unreadChats.get(chat._id) ?? 0}
              icon={<Megaphone className="size-7 text-primary" />}
            />
          )}
        </SidebarMenuItem>
      ))}
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <SidebarMenuItem>
          <Button
            variant="ghost"
            size="sm"
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(30)}
          >
            {common("loadMore")}
          </Button>
        </SidebarMenuItem>
      )}
    </SidebarMenu>
  );
}

function ChatNavLink({
  name,
  href,
  active,
  unread,
  icon,
}: {
  name: string;
  href: string;
  active: boolean;
  unread: number;
  icon: ReactNode;
}) {
  const t = useTranslations("systemNotifications");
  return (
    <SidebarMenuButton
      asChild
      isActive={active}
      tooltip={name}
      aria-label={name}
      className="h-11 gap-3 px-2 text-sm group-data-[collapsible=icon]:p-1!"
    >
      <Link href={href}>
        <span className="relative shrink-0">
          {icon}
          <UnreadIndicator
            count={unread}
            dot
            label={t("unreadMessages", { count: unread })}
          />
        </span>
        <span>{name}</span>
      </Link>
    </SidebarMenuButton>
  );
}

function ArchivedChatNavItem({
  name,
  target,
  canRestore,
  icon,
}: {
  name: string;
  target: ChatTarget;
  canRestore: boolean;
  icon: ReactNode;
}) {
  const t = useTranslations("navigation");
  const [restoring, setRestoring] = useState(false);
  const setArchived = useMutation(api.courseChatMessages.setArchived);
  async function restore() {
    if (restoring) return;
    setRestoring(true);
    try {
      await setArchived({ ...target, archived: false });
      toast.success(t("chatRestored"));
    } catch {
      toast.error(t("restoreChatError"));
    } finally {
      setRestoring(false);
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          tooltip={name}
          aria-label={name}
          className="h-11 gap-3 px-2 text-sm opacity-60 group-data-[collapsible=icon]:p-1!"
        >
          {icon}
          <span>{name}</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start">
        <DropdownMenuItem
          disabled={!canRestore || restoring}
          onSelect={() => void restore()}
        >
          {restoring ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <ArchiveRestore />
          )}
          {t("unarchiveChat")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
