"use client";

import Image from "next/image";
import {
  AlarmClock,
  BookOpen,
  Building2,
  CalendarX2,
  CheckCheck,
  CirclePlay,
  GraduationCap,
  LoaderCircle,
  Megaphone,
  Shield,
} from "lucide-react";
import {
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useState } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRouter } from "@/i18n/navigation";
import { getSystemNotificationHref } from "@/lib/system-notification-navigation";
import { cn } from "@/lib/utils";

type SystemNotification = Doc<"systemNotifications">;

const notificationToneClasses = {
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
} as const;

function getNotificationTone(notification: SystemNotification) {
  if (notification.kind === "class_starting_soon") return "warning";
  if (notification.kind === "class_cancelled") return "destructive";
  if (notification.kind === "recording_available") return "success";
  if (notification.kind === "announcement") return "primary";
  if (notification.action === "removed") return "destructive";
  if (notification.action === "changed") return "info";
  return "success";
}

function NotificationIcon({ kind }: Pick<SystemNotification, "kind">) {
  const Icon =
    kind === "class_starting_soon"
      ? AlarmClock
      : kind === "class_cancelled"
        ? CalendarX2
        : kind === "recording_available"
          ? CirclePlay
          : kind === "course_enrollment"
            ? GraduationCap
            : kind === "course_assignment"
              ? BookOpen
              : kind === "role_changed"
                ? Shield
                : kind === "organization_membership_changed"
                  ? Building2
                  : Megaphone;
  return <Icon className="size-5" aria-hidden="true" />;
}

function getTranslationKey(notification: SystemNotification) {
  if (notification.kind === "course_enrollment") {
    return notification.action === "removed"
      ? "courseEnrollmentRemoved"
      : "courseEnrollmentAdded";
  }
  if (notification.kind === "course_assignment") {
    return notification.action === "removed"
      ? "courseAssignmentRemoved"
      : "courseAssignmentAdded";
  }
  if (notification.kind === "organization_membership_changed") {
    return notification.action === "removed"
      ? "organizationRemoved"
      : notification.action === "changed"
        ? "organizationChanged"
        : "organizationAdded";
  }
  if (notification.kind === "role_changed") {
    return notification.action === "removed"
      ? "roleRemoved"
      : notification.action === "added"
        ? "roleAdded"
        : "roleChanged";
  }
  return notification.kind;
}

function NotificationItem({
  notification,
  onSelect,
}: {
  notification: SystemNotification;
  onSelect: (notification: SystemNotification) => void;
}) {
  const t = useTranslations("systemNotifications");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const translationKey = getTranslationKey(notification);
  const roleLabel = notification.role
    ? t(`roleLabels.${notification.role}`)
    : "";
  const previousRoleLabel = notification.previousRole
    ? t(`roleLabels.${notification.previousRole}`)
    : "";
  const organizationName =
    notification.campusName ?? notification.schoolName ?? "";
  const bodyValues = {
    className: notification.className ?? t("fallbackClassName"),
    organizationName: organizationName || t("fallbackOrganizationName"),
    previousOrganizationName:
      notification.previousOrganizationName ?? t("fallbackOrganizationName"),
    role: roleLabel,
    previousRole: previousRoleLabel,
  };
  const hasNavigation = Boolean(getSystemNotificationHref(notification));
  const isUnread = notification.readAt === undefined;
  const tone = getNotificationTone(notification);

  return (
    <button
      type="button"
      onClick={() => onSelect(notification)}
      className={cn(
        "flex w-full gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0",
        isUnread ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/60",
        !hasNavigation && "cursor-default",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
          notificationToneClasses[tone],
          !isUnread && "opacity-70",
        )}
      >
        <NotificationIcon kind={notification.kind} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-foreground",
            isUnread ? "font-semibold" : "font-normal",
          )}
        >
          {notification.kind === "announcement" &&
          notification.announcementTitle
            ? notification.announcementTitle
            : t(`items.${translationKey}.title`)}
          {isUnread && <span className="sr-only"> {t("unread")}</span>}
        </span>
        <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
          {notification.kind === "announcement" && notification.announcementBody
            ? notification.announcementBody
            : t(`items.${translationKey}.body`, bodyValues)}
        </span>
        {notification.reason && (
          <span className="mt-1 block text-sm text-foreground/80">
            {t("reason", { reason: notification.reason })}
          </span>
        )}
        <time
          dateTime={new Date(notification.createdAt).toISOString()}
          className={cn(
            "mt-1.5 block text-xs text-muted-foreground",
            isUnread && "font-medium",
          )}
        >
          {format.relativeTime(new Date(notification.createdAt), now)}
        </time>
      </span>
    </button>
  );
}

function NotificationFeed({ onClose }: { onClose: () => void }) {
  const t = useTranslations("systemNotifications");
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const { results, status, loadMore } = usePaginatedQuery(
    api.systemNotifications.list,
    isAuthenticated ? {} : "skip",
    { initialNumItems: 20 },
  );
  const markRead = useMutation(api.systemNotifications.markRead);
  const markAllRead = useMutation(api.systemNotifications.markAllRead);

  const handleSelect = async (notification: SystemNotification) => {
    if (notification.readAt === undefined) {
      await markRead({ notificationId: notification._id });
    }
    const href = getSystemNotificationHref(notification);
    if (!href) return;
    onClose();
    router.push(href);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <h2 className="font-semibold text-foreground">{t("title")}</h2>
        {results.some((notification) => notification.readAt === undefined) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void markAllRead({})}
          >
            <CheckCheck aria-hidden="true" />
            {t("markAllRead")}
          </Button>
        )}
      </div>
      <ScrollArea type="always" className="h-0 min-h-0 flex-1">
        {status === "LoadingFirstPage" ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            {t("loading")}
          </div>
        ) : results.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <CheckCheck className="size-6" aria-hidden="true" />
            </span>
            <div>
              <p className="font-medium text-foreground">{t("emptyTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("emptyDescription")}
              </p>
            </div>
          </div>
        ) : (
          <>
            {results.map((notification) => (
              <NotificationItem
                key={notification._id}
                notification={notification}
                onSelect={(item) => void handleSelect(item)}
              />
            ))}
            {(status === "CanLoadMore" || status === "LoadingMore") && (
              <div className="flex justify-center p-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={status === "LoadingMore"}
                  onClick={() => loadMore(20)}
                >
                  {status === "LoadingMore" && (
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                  )}
                  {t("loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </ScrollArea>
    </div>
  );
}

export function SystemNotificationCenter() {
  const t = useTranslations("systemNotifications");
  const isMobile = useIsMobile();
  const { isAuthenticated } = useConvexAuth();
  const unreadCount = useQuery(
    api.systemNotifications.getUnreadCount,
    isAuthenticated ? {} : "skip",
  );
  const [open, setOpen] = useState(false);
  const hasUnread = (unreadCount ?? 0) > 0;
  const unreadLabel = hasUnread
    ? t("openWithUnread", { count: unreadCount ?? 0 })
    : t("open");

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="relative size-8 rounded-full bg-sidebar ring-1 ring-sidebar-border hover:bg-sidebar-accent"
      aria-label={unreadLabel}
      title={unreadLabel}
    >
      <Image
        src="/notification-bell.svg"
        alt=""
        width={20}
        height={20}
        unoptimized
        className="h-7 w-auto"
      />
      {hasUnread && (
        <span className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white">
          {(unreadCount ?? 0) >= 100 ? "99+" : unreadCount}
        </span>
      )}
    </Button>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent className="w-[min(92vw,24rem)] gap-0 p-0 sm:max-w-sm">
          <SheetHeader className="sr-only">
            <SheetTitle>{t("title")}</SheetTitle>
            <SheetDescription>{t("description")}</SheetDescription>
          </SheetHeader>
          <NotificationFeed onClose={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="flex h-[min(36rem,var(--radix-popover-content-available-height))] w-[24rem] flex-col overflow-hidden p-0"
      >
        <NotificationFeed onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
