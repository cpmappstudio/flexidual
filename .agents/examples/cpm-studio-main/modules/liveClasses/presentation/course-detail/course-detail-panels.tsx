import { useTranslations } from "next-intl";
import { Mail01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getImageFallbackLabel } from "@/lib/files/image";
import type { FlexidualCourse } from "@/modules/liveClasses/lib/flexidual-course-types";
import { FlexidualCourseStudentsTable } from "@/modules/liveClasses/presentation/course-detail/course-detail-students-table";
import { FlexidualCourseDetailWeekCalendar } from "@/modules/liveClasses/presentation/course-detail/course-detail-week-calendar";

type PanelProps = {
  course: FlexidualCourse;
};

export function SessionsPanel({ course }: PanelProps) {
  const detailT = useTranslations("TenantLiveClasses.courses.detail");

  return (
    <section aria-label={detailT("tabs.sessions")} className="min-w-0">
      <div className="flex min-w-0 flex-col gap-10 px-6">
        <section
          aria-labelledby="course-weekly-schedule-heading"
          className="min-w-0"
        >
            <FlexidualCourseDetailWeekCalendar
              sessions={course.sessions.weeklySchedule}
              getDayLabel={(weekday) => detailT(`sessions.days.${weekday}`)}
              emptyLabel={detailT("sessions.noSessions")}
            />
        </section>
      </div>
    </section>
  );
}

export function ContentPanel({ course }: PanelProps) {
  const detailT = useTranslations("TenantLiveClasses.courses.detail");
  const lessons = [
    ...course.content.inheritedLessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      summary: lesson.summary,
      objectives: lesson.objectives,
      moduleLabel: lesson.moduleLabel,
      detailLabel: detailT("content.plannedUse"),
      detailValue: lesson.plannedUse,
      isCustom: false,
    })),
    ...course.content.customLessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      summary: lesson.summary,
      objectives: lesson.objectives,
      detailLabel: detailT("content.lessonPlacement"),
      detailValue: lesson.placement,
      isCustom: true,
    })),
  ];

  return (
    <section aria-label={detailT("tabs.content")} className="min-w-0">
      <div className="px-6">
        <Accordion type="multiple" className="rounded-[1.25rem] border-border/70">
          {lessons.map((lesson) => (
            <AccordionItem key={lesson.id} value={lesson.id}>
              <AccordionTrigger className="px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold tracking-tight text-balance text-foreground">
                      {lesson.title}
                    </h2>
                    {lesson.isCustom ? (
                      <Badge variant="secondary">
                        {detailT("content.customLessonEyebrow")}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-5">
                <div className="flex flex-col gap-4">
                  <p className="text-sm leading-6 text-muted-foreground">
                    {lesson.summary}
                  </p>

                  <div>
                    <p className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      {detailT("content.objectives")}
                    </p>
                    <div className="mt-3 flex flex-col gap-2">
                      {lesson.objectives.map((objective) => (
                        <div
                          key={objective}
                          className="rounded-[1rem] bg-muted/30 px-3 py-3"
                        >
                          <p className="text-sm leading-5 text-foreground/80">
                            {objective}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

export function PeoplePanel({ course }: PanelProps) {
  const detailT = useTranslations("TenantLiveClasses.courses.detail");

  return (
    <section aria-label={detailT("tabs.people")} className="min-w-0">
      <div className="flex min-w-0 flex-col gap-12 px-6">
        <section aria-labelledby="course-teacher-heading" className="min-w-0">
          <header className="flex items-center justify-between gap-4 border-b border-border/70 px-6 pb-4">
            <div className="space-y-1">
              <h2
                id="course-teacher-heading"
                className="text-base font-semibold tracking-tight"
              >
                {detailT("people.teacher")}
              </h2>
            </div>
          </header>

          <div className="flex flex-col justify-between gap-4 px-6 pt-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <Avatar className="size-10">
                <AvatarFallback className="text-sm font-semibold">
                  {getImageFallbackLabel({
                    name: course.teacher.name,
                    fallback: "TC",
                  })}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h3 className="text-base font-semibold tracking-tight text-balance">
                  {course.teacher.name}
                </h3>
              </div>
            </div>

            <a href={`mailto:${course.teacher.email}`}>
              <HugeiconsIcon
                icon={Mail01Icon}
                strokeWidth={2}
                className="size-4 shrink-0"
                aria-hidden="true"
              />
            </a>
          </div>
        </section>

        <section aria-labelledby="course-students-heading" className="min-w-0">
          <header className="flex items-center justify-between gap-4 border-b border-border/70 px-6 pb-4">
            <div className="space-y-1">
              <h2
                id="course-students-heading"
                className="text-base font-semibold tracking-tight"
              >
                {detailT("people.students")}
              </h2>
            </div>
            <p className="font-medium text-foreground">
              {course.students.length} {detailT("people.students")}
            </p>
          </header>

          <div className="min-w-0 px-6 pt-5">
            <FlexidualCourseStudentsTable students={course.students} />
          </div>
        </section>
      </div>
    </section>
  );
}
