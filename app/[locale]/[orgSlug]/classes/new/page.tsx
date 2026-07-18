"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { endOfDay, startOfDay } from "date-fns";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { type DateRange } from "react-day-picker";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  CourseFormData,
  CourseFormFields,
} from "@/components/teaching/classes/course-form-fields";
import {
  CourseWeeklyCalendar,
  CourseWeeklySlot,
} from "@/components/teaching/classes/course-weekly-calendar";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { getRoleForOrg } from "@/lib/rbac";



export default function CreateCoursePage() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params.orgSlug as string) || "system";
  const { sessionClaims } = useAuth();
  const role = getRoleForOrg(sessionClaims, orgSlug);
  const isAdmin =
    role === "admin" || role === "principal" || role === "superadmin";
  const orgContext = useQuery(api.organizations.resolveSlug, { slug: orgSlug });
  const curriculums = useQuery(api.curriculums.list, {
    includeInactive: false,
  });
  const teachers = useQuery(
    api.users.getUsers,
    isAdmin && orgContext
      ? {
          role: "teacher",
          orgType: orgContext.type,
          orgId: orgContext._id,
        }
      : "skip",
  );
  const createCourse = useMutation(api.classes.createWithSchedule);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [academicPeriod, setAcademicPeriod] = useState<DateRange>();
  const [weeklySlots, setWeeklySlots] = useState<CourseWeeklySlot[]>([]);
  const [formData, setFormData] = useState<CourseFormData>({
    name: "",
    description: "",
    academicYear: "",
    curriculumId: "",
    teacherId: "",
  });

  const isSubmitDisabled =
    !formData.name.trim() ||
    !formData.curriculumId ||
    !formData.teacherId ||
    !academicPeriod?.from ||
    !academicPeriod.to ||
    weeklySlots.length === 0;



  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitDisabled || !academicPeriod?.from || !academicPeriod.to) return;
    setIsSubmitting(true);

    try {
      const result = await createCourse({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        curriculumId: formData.curriculumId as Id<"curriculums">,
        teacherId: formData.teacherId as Id<"users">,
        campusId:
          orgContext?.type === "campus"
            ? (orgContext._id as Id<"campuses">)
            : undefined,
        startDate: startOfDay(academicPeriod.from).getTime(),
        endDate: endOfDay(academicPeriod.to).getTime(),
        timezoneOffset: new Date().getTimezoneOffset(),
        weeklySlots: weeklySlots.map((slot) => ({
          dayOfWeek: slot.dayOfWeek,
          startMinutes: slot.startMinutes,
          durationMinutes: slot.endMinutes - slot.startMinutes,
          sessionType: slot.sessionType,
        })),
      });
      toast.success(t("class.created"));
      router.push(`/${orgSlug}/classes/${result.classId}`);
    } catch {
      toast.error(t("errors.operationFailed"));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full space-y-8">
      <header className="sticky top-[var(--header-height)] z-30 isolate flex items-center justify-between gap-4 after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:-z-10 after:h-[calc(100%+2rem)] after:bg-gradient-to-b after:from-background after:via-background/80 after:to-background/0 after:content-['']">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("class.new")}</h1>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" type="button" asChild>
            <Link href={`/${orgSlug}/classes`}>{t("common.cancel")}</Link>
          </Button>
          <Button
            type="submit"
            form="create-course-form"
            disabled={isSubmitting || isSubmitDisabled}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("class.createClass")}
          </Button>
        </div>
      </header>

      <form
        id="create-course-form"
        onSubmit={handleSubmit}
        className="space-y-10"
      >
        <section className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <CourseFormFields
            formData={formData}
            setFormDataAction={setFormData}
            curriculums={curriculums}
            teachers={teachers}
            isAdmin={isAdmin}
            nameRequired
            showAcademicYear={false}
          />

          <div className="space-y-2">
            <Label>
              {t("class.academicPeriod")} {" "}
              <span className="text-destructive">*</span>
            </Label>
            <Calendar
              mode="range"
              defaultMonth={academicPeriod?.from}
              selected={academicPeriod}
              onSelect={setAcademicPeriod}
              numberOfMonths={2}
              className="rounded-lg border"
            />
          </div>
        </section>

        <section className="space-y-5">
          <h2 className="text-xl font-semibold">{t("class.weeklySchedule")}</h2>
          <CourseWeeklyCalendar
            value={weeklySlots}
            onChangeAction={setWeeklySlots}
            courseName={formData.name}
            teacherName={
              teachers?.find((teacher) => teacher._id === formData.teacherId)
                ?.fullName
            }
          />
        </section>

      </form>
    </div>
  );
}
