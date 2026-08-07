"use client";

import { useConvexAuth, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  LockKeyhole,
  Radio,
  School,
  UserRound,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { useCurrentMinute } from "@/hooks/use-current-minute";
import { Link } from "@/i18n/navigation";

type CatalogResult = Exclude<
  FunctionReturnType<typeof api.classes.getCatalog>,
  null
>;
type CatalogCourse = CatalogResult["course"];
type CatalogSession = NonNullable<CatalogCourse["liveSession"]>;

function SessionRow({
  session,
  live,
}: {
  session: CatalogSession;
  live?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const date = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: session.timeZone,
  }).format(new Date(session.start));

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-sidebar p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          {live ? (
            <Radio className="size-5" aria-hidden="true" />
          ) : (
            <CalendarClock className="size-5" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold text-foreground">
              {session.title}
            </p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {date} · {session.timeZone}
          </p>
        </div>
      </div>
      {session.canOpen && (
        <Button asChild className="sm:shrink-0">
          <Link href={`/${orgSlug}/classroom/${session.roomName}`}>
            {live && <Radio aria-hidden="true" />}
            {live ? t("catalog.join") : t("classroom.prepareRoom")}
          </Link>
        </Button>
      )}
    </div>
  );
}

export function CourseCatalogDetail() {
  const t = useTranslations();
  const { orgSlug, classId } = useParams<{
    orgSlug: string;
    classId: string;
  }>();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const now = useCurrentMinute();
  const catalog = useQuery(
    api.classes.getCatalog,
    isAuthenticated ? { orgSlug, classId, now } : "skip",
  );

  if (isAuthLoading || catalog === undefined) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }

  if (catalog === null) {
    return (
      <div className="grid min-h-64 place-items-center text-center">
        <div className="space-y-3">
          <BookOpen className="mx-auto size-9 text-muted-foreground" />
          <p className="font-semibold">{t("catalog.courseNotFound")}</p>
          <Button variant="outline" asChild>
            <Link href={`/${orgSlug}/catalog`}>
              <ArrowLeft aria-hidden="true" />
              {t("catalog.backToCatalog")}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const course = catalog.course;

  const teacherInitials = course.teacherName
    ?.split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-w-0 space-y-6 pb-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/${orgSlug}/catalog`}>
          <ArrowLeft aria-hidden="true" />
          {t("catalog.backToCatalog")}
        </Link>
      </Button>

      <header
        className="overflow-hidden rounded-xl border border-border border-t-4 bg-sidebar"
        style={{ borderTopColor: course.curriculumColor }}
      >
        <div className="grid gap-5 p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-7">
          <div className="grid size-20 place-items-center rounded-2xl bg-primary/10 text-primary sm:size-24">
            <BookOpen className="size-10 sm:size-12" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-primary">
                {course.curriculumTitle}
              </p>
              {catalog.isStaffViewer && (
                <Badge variant="outline">
                  {course.accessMode === "private" ? (
                    <LockKeyhole aria-hidden="true" />
                  ) : (
                    <School aria-hidden="true" />
                  )}
                  {course.accessMode === "private"
                    ? t("catalog.private")
                    : t("catalog.institution")}
                </Badge>
              )}
            </div>
            <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
              {course.name}
            </h1>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
              {(course.gradeName ?? course.gradeCode) && (
                <span>{course.gradeName ?? course.gradeCode}</span>
              )}
              {course.campusName && <span>{course.campusName}</span>}
              {course.institutionName && <span>{course.institutionName}</span>}
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 space-y-3">
          <h2 className="text-lg font-bold">{t("catalog.sessions")}</h2>
          {course.liveSession && (
            <SessionRow session={course.liveSession} live />
          )}
          {course.nextSession && <SessionRow session={course.nextSession} />}
          {!course.liveSession && !course.nextSession && (
            <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
              {t("catalog.noUpcomingSessions")}
            </div>
          )}
        </section>

        <aside className="space-y-4 border-t border-border pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              {t("catalog.about")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              {course.description || t("common.noDescription")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Avatar className="size-9">
              {course.teacherImageUrl && (
                <AvatarImage
                  src={course.teacherImageUrl}
                  alt={course.teacherName ?? ""}
                  className="object-cover"
                />
              )}
              <AvatarFallback>
                {teacherInitials || <UserRound className="size-4" />}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {t("navigation.teacher")}
              </p>
              <p className="truncate text-sm font-semibold">
                {course.teacherName || t("catalog.unassignedTeacher")}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
