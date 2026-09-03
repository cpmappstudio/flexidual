"use client";

import { useState } from "react";
import { useConvexAuth, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import {
  BookOpen,
  CalendarClock,
  LockKeyhole,
  Search,
  School,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { CurriculumIcon } from "@/components/teaching/curriculums/curriculum-icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  ResponsiveFilters,
  type ResponsiveFilter,
} from "@/components/ui/responsive-filters";
import { getCurrentMinute } from "@/hooks/use-current-minute";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type CatalogCourse = FunctionReturnType<
  typeof api.classes.listCatalog
>["page"][number];
type TileContext = "live" | "upcoming" | "course";
type CatalogVisibility = "public" | "private";

function CourseRail({
  title,
  courses,
  context,
}: {
  title: string;
  courses: CatalogCourse[];
  context: TileContext;
}) {
  if (courses.length === 0) return null;

  return (
    <section className="min-w-0 space-y-3" aria-label={title}>
      <h2 className="text-lg font-bold text-foreground sm:text-xl">{title}</h2>
      <ScrollArea className="w-full [&_[data-slot=scroll-area-viewport]]:snap-x [&_[data-slot=scroll-area-viewport]]:snap-mandatory">
        <div className="flex w-max gap-3 pb-4 sm:gap-4">
          {courses.map((course) => (
            <CourseTile
              key={`${context}-${course._id}`}
              course={course}
              context={context}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  );
}

function CourseTile({
  course,
  context,
  className,
}: {
  course: CatalogCourse;
  context: TileContext;
  className?: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const session = context === "live" ? course.liveSession : course.nextSession;
  const scheduleLabel = session
    ? new Intl.DateTimeFormat(locale, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: session.timeZone,
      }).format(new Date(session.start))
    : null;
  const initials = course.teacherName
    ?.split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const href =
    session?.canOpen === true
      ? `/${orgSlug}/classroom/${session.roomName}`
      : `/${orgSlug}/classes/${course._id}`;

  return (
    <Link
      href={href}
      className={cn(
        "w-[18rem] shrink-0 snap-start rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-[20rem]",
        className,
      )}
      aria-label={`${t("catalog.viewCourse")}: ${course.name}`}
    >
      <article className="min-w-0">
        <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-sidebar-border bg-sidebar">
          <span
            className="absolute inset-0 opacity-10"
            style={{ backgroundColor: course.curriculumColor }}
            aria-hidden="true"
          />
          <span
            className="absolute -top-12 -right-8 size-40 rounded-full opacity-15"
            style={{ backgroundColor: course.curriculumColor }}
            aria-hidden="true"
          />
          <CurriculumIcon
            iconKey={course.curriculumIconKey}
            size={96}
            className="relative size-20 drop-shadow-sm"
          />
          {context === "live" && (
            <Badge className="absolute top-3 right-3 bg-destructive uppercase text-white">
              {t("common.live")}
            </Badge>
          )}
          {course.campusName && (
            <Badge
              variant="outline"
              className={cn(
                "absolute top-3 left-3 min-w-0 bg-background/90",
                context === "live"
                  ? "max-w-[calc(100%-6rem)]"
                  : "max-w-[calc(100%-1.5rem)]",
              )}
              aria-label={`${course.campusName} · ${
                course.accessMode === "private"
                  ? t("catalog.private")
                  : t("catalog.institution")
              }`}
              title={course.campusName}
            >
              {course.accessMode === "private" ? (
                <LockKeyhole aria-hidden="true" />
              ) : (
                <School aria-hidden="true" />
              )}
              <span className="truncate">{course.campusName}</span>
            </Badge>
          )}
        </div>

        <div className="mt-3 flex min-w-0 items-start gap-2.5">
          <Avatar className="size-8 shrink-0">
            {course.teacherImageUrl && (
              <AvatarImage
                src={course.teacherImageUrl}
                alt={course.teacherName ?? ""}
                className="object-cover"
              />
            )}
            <AvatarFallback className="text-[10px]">
              {initials || <BookOpen className="size-3.5" aria-hidden="true" />}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-sm font-bold leading-snug text-foreground">
              {course.name}
            </h3>
            {session?.title && session.title !== course.name && (
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                {session.title}
              </p>
            )}
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {course.curriculumTitle}
              {course.teacherName ? ` · ${course.teacherName}` : ""}
            </p>
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              {scheduleLabel && (
                <span
                  className={cn(
                    "flex min-w-0 items-center gap-1 font-medium",
                    context === "live" && "text-destructive",
                  )}
                >
                  <CalendarClock
                    className="size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="truncate">{scheduleLabel}</span>
                </span>
              )}
              {scheduleLabel && (course.gradeName ?? course.gradeCode) && (
                <span aria-hidden="true">·</span>
              )}
              {(course.gradeName ?? course.gradeCode) && (
                <span className="shrink-0">
                  {course.gradeName ?? course.gradeCode}
                </span>
              )}
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}

function CourseGrid({
  title,
  courses,
}: {
  title: string;
  courses: CatalogCourse[];
}) {
  if (courses.length === 0) return null;

  return (
    <section className="min-w-0 space-y-3" aria-label={title}>
      <h2 className="text-lg font-bold text-foreground sm:text-xl">{title}</h2>
      <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {courses.map((course) => (
          <CourseTile
            key={course._id}
            course={course}
            context="course"
            className="w-full sm:w-full"
          />
        ))}
      </div>
    </section>
  );
}

function CatalogRailsSkeleton() {
  return (
    <div className="space-y-8" aria-hidden="true">
      {[0, 1, 2].map((section) => (
        <div key={section} className="space-y-3">
          <Skeleton className="h-6 w-36" />
          <div className="flex gap-4 overflow-hidden">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-64 w-72 shrink-0 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-9 w-full" />
      <CatalogRailsSkeleton />
    </div>
  );
}

export function CourseCatalog() {
  const t = useTranslations();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const [now] = useState(getCurrentMinute);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim());
  const [selectedCurriculumId, setSelectedCurriculumId] =
    useState<Id<"curriculums"> | null>(null);
  const [selectedCampusId, setSelectedCampusId] =
    useState<Id<"campuses"> | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] =
    useState<Id<"users"> | null>(null);
  const [selectedVisibility, setSelectedVisibility] =
    useState<CatalogVisibility | null>("public");
  const canQuery = isAuthenticated;
  const filterOptions = useQuery(
    api.classes.getCatalogFilters,
    canQuery
      ? {
          orgSlug,
          ...(selectedCampusId && { campusId: selectedCampusId }),
        }
      : "skip",
  );
  const { results, status, loadMore } = usePaginatedQuery(
    api.classes.listCatalog,
    canQuery
      ? {
          orgSlug,
          now,
          ...(debouncedSearch && { search: debouncedSearch }),
          ...(selectedCampusId && { campusId: selectedCampusId }),
          ...(selectedCurriculumId && {
            curriculumId: selectedCurriculumId,
          }),
          ...(selectedTeacherId && { teacherId: selectedTeacherId }),
          visibility: filterOptions?.canViewPrivateCourses
            ? (selectedVisibility ?? "all")
            : "public",
        }
      : "skip",
    { initialNumItems: 24 },
  );
  if (isAuthLoading) {
    return <CatalogSkeleton />;
  }

  const filters: ResponsiveFilter[] = [
    {
      key: "campus",
      label: t("navigation.campus"),
      allLabel: t("admin.allCampuses"),
      value: selectedCampusId,
      options: filterOptions?.campuses ?? [],
      onChange: (value) => {
        setSelectedCampusId(value as Id<"campuses"> | null);
        setSelectedTeacherId(null);
      },
    },
    {
      key: "curriculum",
      label: t("navigation.curriculum"),
      allLabel: t("navigation.allCurriculums"),
      value: selectedCurriculumId,
      options: filterOptions?.curriculums ?? [],
      onChange: (value) =>
        setSelectedCurriculumId(value as Id<"curriculums"> | null),
    },
    {
      key: "teacher",
      label: t("navigation.teacher"),
      allLabel: t("calendar.allTeachers"),
      value: selectedTeacherId,
      options: filterOptions?.teachers ?? [],
      onChange: (value) => setSelectedTeacherId(value as Id<"users"> | null),
    },
    ...(filterOptions?.canViewPrivateCourses
      ? [
          {
            key: "visibility",
            label: t("catalog.visibility"),
            allLabel: t("catalog.allVisibility"),
            value: selectedVisibility,
            options: [
              { value: "public", label: t("catalog.public") },
              { value: "private", label: t("catalog.privateCourses") },
            ],
            onChange: (value: string | null) =>
              setSelectedVisibility(value as CatalogVisibility | null),
          },
        ]
      : []),
  ];

  const liveCourses = results.filter((course) => course.liveSession);
  const upcomingCourses = results
    .filter((course) => course.nextSession)
    .sort((a, b) => (a.nextSession?.start ?? 0) - (b.nextSession?.start ?? 0));

  return (
    <div className="min-w-0 space-y-8 pb-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <InputGroup className="min-w-64 flex-1 bg-card">
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("catalog.searchPlaceholder")}
            aria-label={t("catalog.searchPlaceholder")}
          />
        </InputGroup>
        <ResponsiveFilters
          filters={filters}
          menuLabel={t("table.filters")}
          clearLabel={t("table.clearFilters")}
        />
      </div>

      {status === "LoadingFirstPage" ? (
        <CatalogRailsSkeleton />
      ) : results.length === 0 && status === "Exhausted" ? (
        <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-border px-6 text-center">
          <div className="space-y-2">
            <BookOpen className="mx-auto size-9 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">
              {debouncedSearch
                ? t("catalog.noResults")
                : t("catalog.emptyTitle")}
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {debouncedSearch
                ? t("catalog.noResultsDescription")
                : t("catalog.emptyDescription")}
            </p>
          </div>
        </div>
      ) : (
        <>
          <CourseRail
            title={t("catalog.liveNow")}
            courses={liveCourses}
            context="live"
          />
          <CourseRail
            title={t("catalog.upcoming")}
            courses={upcomingCourses}
            context="upcoming"
          />
          <CourseGrid title={t("catalog.allCourses")} courses={results} />
        </>
      )}

      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(24)}
          >
            {t("common.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
