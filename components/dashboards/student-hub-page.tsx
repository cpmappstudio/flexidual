"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { RocketLaunchButtonContent } from "@/components/student/rocket-transition";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BellRing,
  CalendarDays,
  Clock,
  Pencil,
  GraduationCap,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { enUS, es, ptBR } from "date-fns/locale";
import { format, isSameDay } from "date-fns";
import { StudentScheduleEvent } from "@/lib/types/student";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Link, useRouter } from "@/i18n/navigation";
import { useOrgBasePath } from "@/hooks/use-org-base-path";
import { useParams } from "next/navigation";

const ClassroomDropZone = dynamic(() =>
  import("@/components/student/classroom-drop-zone").then(
    (module) => module.ClassroomDropZone,
  ),
);
const UserDialog = dynamic(() =>
  import("@/components/admin/users/user-dialog").then(
    (module) => module.UserDialog,
  ),
);

const COURSE_CARD_ACCENTS = [
  "border-sky-200 bg-sky-50/80 before:bg-sky-400",
  "border-emerald-200 bg-emerald-50/80 before:bg-emerald-400",
  "border-amber-200 bg-amber-50/80 before:bg-amber-400",
  "border-rose-200 bg-rose-50/80 before:bg-rose-400",
  "border-violet-200 bg-violet-50/80 before:bg-violet-400",
  "border-cyan-200 bg-cyan-50/80 before:bg-cyan-400",
];

function CountdownToast({
  lesson,
  onStop,
  onGoToClass,
  title,
  stopLabel,
  goToClassLabel,
}: {
  lesson: StudentScheduleEvent;
  onStop: () => void;
  onGoToClass: () => void;
  title: string;
  stopLabel: string;
  goToClassLabel: string;
}) {
  const [timeLeft, setTimeLeft] = useState(() => lesson.start - Date.now());

  useEffect(() => {
    const tick = setInterval(() => {
      const remaining = lesson.start - Date.now();
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(tick);
    }, 1000);
    return () => clearInterval(tick);
  }, [lesson.start]);

  const formatted = () => {
    if (timeLeft <= 0) return "🔔 Now!";
    const m = Math.floor(timeLeft / 60000);
    const s = Math.floor((timeLeft % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bg-card rounded-2xl shadow-2xl border-2 border-warning/30 overflow-hidden w-[340px]">
      {/* Header strip */}
      <div className="bg-warning px-4 py-2 flex items-center gap-2">
        <BellRing className="w-4 h-4 text-warning-foreground animate-bounce flex-shrink-0" />
        <p className="text-warning-foreground font-bold text-sm truncate flex-1">
          {title}
        </p>
        <span
          className={cn(
            "font-mono font-black text-warning-foreground text-lg tabular-nums",
            timeLeft <= 0 && "animate-pulse",
          )}
        >
          {formatted()}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-card-foreground truncate">
          🚀 {lesson.title}
        </p>
        {lesson.className && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            📚 {lesson.className}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 flex gap-2">
        <button
          onClick={onStop}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground bg-muted hover:bg-muted/80 border border-border rounded-xl px-3 py-2 transition-colors"
        >
          🔕 {stopLabel}
        </button>
        <button
          onClick={onGoToClass}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold text-warning-foreground bg-warning hover:bg-warning/90 rounded-xl px-3 py-2 transition-all shadow-sm shadow-warning/20"
        >
          🚀 {goToClassLabel}
        </button>
      </div>
    </div>
  );
}

export default function StudentHubPage({ studentId }: { studentId?: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const basePath = useOrgBasePath();
  const router = useRouter();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const isViewingStudentProfile = Boolean(studentId);
  const { isLoaded: isClerkLoaded, user } = useUser();
  const currentDateLocale =
    locale === "es" ? es : locale === "pt-BR" ? ptBR : enUS;

  const [activeLesson, setActiveLesson] = useState<StudentScheduleEvent | null>(
    null,
  );
  const [ctaLaunchingLesson, setCtaLaunchingLesson] =
    useState<StudentScheduleEvent | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [now, setNow] = useState(Date.now);

  const [notifiedLessons, setNotifiedLessons] = useState<Set<string>>(
    new Set(),
  );

  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const alarmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundEnabledRef = useRef(soundEnabled);

  const playRocketSound = useCallback(() => {
    if (!soundEnabledRef.current) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;

      // Master limiter — prevents any clipping regardless of how layers sum
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3; // dB — start compressing just below 0
      limiter.knee.value = 0; // hard knee
      limiter.ratio.value = 20; // brick-wall limiting
      limiter.attack.value = 0.001;
      limiter.release.value = 0.1;
      limiter.connect(ctx.destination);

      const duration = 2.4;
      const t0 = ctx.currentTime;

      // ── Noise layer ──────────────────────────────────────────────────────
      const bufferSize = ctx.sampleRate * duration;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(80, t0);
      filter.frequency.exponentialRampToValueAtTime(900, t0 + duration);
      filter.Q.value = 1.2; // reduced from 2.5 — less resonant spike

      const bass = ctx.createBiquadFilter();
      bass.type = "lowshelf";
      bass.frequency.value = 120;
      bass.gain.value = 7; // reduced from 14 — still deep, won't clip

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0, t0);
      noiseGain.gain.linearRampToValueAtTime(0.45, t0 + 0.15); // reduced from 0.9
      noiseGain.gain.setValueAtTime(0.45, t0 + 1.0);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

      noise.connect(filter);
      filter.connect(bass);
      bass.connect(noiseGain);
      noiseGain.connect(limiter);
      noise.start(t0);
      noise.stop(t0 + duration);

      // ── Sub-bass rumble ───────────────────────────────────────────────────
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = "sine";
      sub.frequency.setValueAtTime(30, t0);
      sub.frequency.exponentialRampToValueAtTime(180, t0 + 1.6);
      subGain.gain.setValueAtTime(0, t0);
      subGain.gain.linearRampToValueAtTime(0.18, t0 + 0.05);
      subGain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.6);
      sub.connect(subGain);
      subGain.connect(limiter);
      sub.start(t0);
      sub.stop(t0 + 1.6);

      // ── Harmonic warmth ───────────────────────────────────────────────────
      const osc2 = ctx.createOscillator();
      const osc2Gain = ctx.createGain();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(55, t0);
      osc2.frequency.exponentialRampToValueAtTime(220, t0 + 1.8);
      osc2Gain.gain.setValueAtTime(0, t0);
      osc2Gain.gain.linearRampToValueAtTime(0.12, t0 + 0.05);
      osc2Gain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.8);
      osc2.connect(osc2Gain);
      osc2Gain.connect(limiter);
      osc2.start(t0);
      osc2.stop(t0 + 1.8);
    } catch {
      /* non-critical */
    }
  }, []);

  // Queries
  const roundedNow = Math.floor(now / 60_000) * 60_000;
  const ownEvents = useQuery(
    api.schedule.getMySchedule,
    isViewingStudentProfile ? "skip" : { now: roundedNow },
  );
  const accessibleLiveClasses = useQuery(
    api.schedule.listAccessibleLiveClasses,
    isViewingStudentProfile ? "skip" : {},
  );
  const dashboardData = useQuery(api.student.getStudentDashboardStats, {
    now: roundedNow,
    ...(studentId ? { studentId, orgSlug } : {}),
  });
  const storedAvatarUrl = useQuery(
    api.users.getAvatarUrl,
    dashboardData?.student.avatarStorageId
      ? { storageId: dashboardData.student.avatarStorageId }
      : "skip",
  );
  const events = isViewingStudentProfile
    ? dashboardData?.upcomingLessons
    : ownEvents;

  useEffect(() => {
    if (isViewingStudentProfile) return;
    const stored = localStorage.getItem("flexidual_sound_alerts");
    if (stored !== "true") return;
    setSoundEnabled(true);
    soundEnabledRef.current = true;

    // Create AudioContext on first interaction (satisfies autoplay policy)
    const unlock = () => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("click", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [isViewingStudentProfile]);

  useEffect(() => {
    if (activeLesson) return;

    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [activeLesson]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const upcomingLessons = useMemo(() => {
    if (!events) return [];

    return events.filter((e) => e.end > now).sort((a, b) => a.start - b.start);
  }, [events, now]);

  const todayLessons = useMemo(() => {
    const today = new Date(now);
    return upcomingLessons.filter((lesson) =>
      isSameDay(new Date(lesson.start), today),
    );
  }, [now, upcomingLessons]);

  const handleLaunchComplete = () => {
    stopAlarm();
    setIsLaunching(false);
  };

  const handleExitClassroom = () => {
    setActiveLesson(null);
    setIsLaunching(false);
  };

  const playChime = useCallback(async (invert: boolean = false) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") await ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(invert ? 440 : 1000, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      invert ? 1000 : 440,
      ctx.currentTime + 0.3,
    );
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  }, []);

  const startAlarm = useCallback(() => {
    if (alarmIntervalRef.current) return;
    playChime();
    alarmIntervalRef.current = setInterval(playChime, 1000);
  }, [playChime]);

  const stopAlarm = useCallback(() => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
  }, []);

  const handleLessonTap = useCallback(
    (lesson: StudentScheduleEvent) => {
      stopAlarm();
      setActiveLesson(lesson);
      playRocketSound();
      setIsLaunching(true);
    },
    [playRocketSound, stopAlarm],
  );

  const handleClassroomCta = (lesson: StudentScheduleEvent) => {
    if (ctaLaunchingLesson) return;
    stopAlarm();
    setCtaLaunchingLesson(lesson);
  };

  const handleClassroomCtaComplete = useCallback(() => {
    if (!ctaLaunchingLesson) return;
    const lesson = ctaLaunchingLesson;
    setCtaLaunchingLesson(null);
    handleLessonTap(lesson);
  }, [ctaLaunchingLesson, handleLessonTap]);

  useEffect(() => {
    if (isViewingStudentProfile) return;
    if (upcomingLessons.length === 0) return;

    const checkNotifications = () => {
      const currentTime = Date.now();
      upcomingLessons.forEach((lesson) => {
        const timeDiff = lesson.start - currentTime;
        const minutesLeft = timeDiff / 60000;

        if (
          minutesLeft <= 5 &&
          minutesLeft > 0 &&
          !notifiedLessons.has(lesson.scheduleId)
        ) {
          if (soundEnabledRef.current) {
            startAlarm();
          }

          toast.custom(
            () => (
              <CountdownToast
                lesson={lesson}
                onStop={() => {
                  stopAlarm();
                  toast.dismiss(lesson.scheduleId);
                }}
                onGoToClass={() => {
                  handleLessonTap(lesson);
                  toast.dismiss(lesson.scheduleId);
                }}
                title={t("schedule.classStartingSoon")}
                stopLabel={t("common.muteAlarm") || "Stop"}
                goToClassLabel={t("dashboard.goToClassroom") || "Go to Class"}
              />
            ),
            {
              id: lesson.scheduleId,
              duration: 30000,
              onDismiss: stopAlarm,
              onAutoClose: stopAlarm,
            },
          );
          setNotifiedLessons((prev) => new Set(prev).add(lesson.scheduleId));
        }
      });
    };

    const interval = setInterval(checkNotifications, 15000);
    return () => clearInterval(interval);
  }, [
    handleLessonTap,
    isViewingStudentProfile,
    notifiedLessons,
    startAlarm,
    stopAlarm,
    t,
    upcomingLessons,
  ]);

  const classStats = dashboardData?.classes ?? [];
  const studentProfile = dashboardData?.student;
  const overallStats = dashboardData?.overall;

  const liveLessons = isViewingStudentProfile
    ? (dashboardData?.upcomingLessons.filter(
        (lesson) => lesson.status === "active" && lesson.isLive,
      ) ?? [])
    : (accessibleLiveClasses ?? []);
  const nextLesson = liveLessons[0] ?? todayLessons[0] ?? null;
  const laterTodayLessons = todayLessons
    .filter((lesson) => lesson.scheduleId !== nextLesson?.scheduleId)
    .slice(0, 3);
  const clerkDisplayName =
    user?.fullName?.trim() ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  const displayName =
    (isViewingStudentProfile ? undefined : clerkDisplayName) ||
    studentProfile?.fullName ||
    (isViewingStudentProfile ? undefined : user?.username) ||
    "Student";
  const avatarUrl = isViewingStudentProfile
    ? storedAvatarUrl || studentProfile?.imageUrl
    : user?.imageUrl || storedAvatarUrl || studentProfile?.imageUrl;
  const gradeLabel = studentProfile?.gradeName
    ? studentProfile.gradeName
    : studentProfile?.grade
      ? `${t("student.grade")} ${studentProfile.grade}`
      : t("student.grade");
  const profileIsLoaded = isViewingStudentProfile
    ? dashboardData !== undefined
    : isClerkLoaded;
  const editableStudentOrgId =
    isViewingStudentProfile && dashboardData?.canEdit
      ? studentProfile?.orgId
      : undefined;

  const totalSessions =
    overallStats?.totalSessions ??
    classStats.reduce((sum, item) => sum + item.stats.totalClasses, 0);
  const completedSessions =
    overallStats?.completedSessions ??
    classStats.reduce((sum, item) => sum + item.stats.completedClasses, 0);
  const attendedSessions = classStats.reduce(
    (sum, item) => sum + item.stats.attendedClasses,
    0,
  );
  const missedSessions = Math.max(0, completedSessions - attendedSessions);
  const upcomingCount = Math.max(0, totalSessions - completedSessions);
  const isNextLessonLive = Boolean(
    nextLesson &&
      (nextLesson.status === "active" ||
        nextLesson.isLive ||
        nextLesson.isStudentActive ||
        (now >= nextLesson.start && now <= nextLesson.end)),
  );
  const formatClassCountdown = (lesson: StudentScheduleEvent | null) => {
    if (!lesson) return "--:--";
    const diff = lesson.start - now;
    if (diff <= 0) return "00:00";

    const totalSeconds = Math.floor(diff / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const classroomCtaLabel = t("dashboard.goToClassroom");

  if (isViewingStudentProfile && dashboardData === undefined) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (isViewingStudentProfile && dashboardData === null) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("errors.permissionDenied")}
      </p>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col xl:h-[calc(100svh-var(--header-height)-2rem)]">
      {!activeLesson && !isLaunching && (
        <div className="flex min-h-0 flex-col gap-4 xl:flex-1">
          {!isViewingStudentProfile && (
            <div className="min-w-0">
              <p className="truncate text-xl font-bold text-foreground">
                {t("student.welcome", {
                  name:
                    user?.firstName ||
                    studentProfile?.fullName?.split(" ")[0] ||
                    "Student",
                })}
              </p>
              <p className="text-sm font-medium text-muted-foreground">
                {t("student.welcomeMessage")}
              </p>
            </div>
          )}

          <div className="grid gap-5 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="contents xl:grid xl:min-h-0 xl:grid-rows-[minmax(260px,280px)_minmax(0,1fr)] xl:gap-4">
              <Card className="relative order-1 flex min-h-0 flex-col justify-center gap-0 rounded-[2rem] border-0 py-0 shadow-md ring-1 ring-border/80 xl:order-none">
                {editableStudentOrgId && (
                  <CardHeader className="absolute inset-x-4 top-4 z-20 p-0 sm:inset-x-5 sm:top-5">
                    <CardAction>
                      <UserDialog
                        user={studentProfile}
                        defaultRole="student"
                        allowedRoles={["student"]}
                        scope={{
                          orgType: "campus",
                          orgId: editableStudentOrgId,
                        }}
                        hideRole
                        onDeleted={() => router.replace(`${basePath}/students`)}
                        trigger={
                          <Button
                            type="button"
                            className="shrink-0"
                            aria-label={t("student.edit")}
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                            <span className="hidden sm:inline">
                              {t("student.edit")}
                            </span>
                          </Button>
                        }
                      />
                    </CardAction>
                  </CardHeader>
                )}

                <CardContent className="grid w-full gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(180px,0.7fr)_minmax(0,1.3fr)] xl:items-center">
                  <div
                    className={cn(
                      "flex w-full items-center gap-3 text-left xl:flex-col xl:text-center",
                      editableStudentOrgId && "pr-12 sm:pr-28 xl:pr-0",
                    )}
                  >
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-[4px] border-warning bg-primary/10 shadow-inner sm:h-20 sm:w-20 xl:h-28 xl:w-28">
                      {profileIsLoaded ? (
                        <Avatar className="h-full w-full rounded-none">
                          {avatarUrl && (
                            <AvatarImage
                              src={avatarUrl}
                              alt={displayName}
                              className="object-cover"
                            />
                          )}
                          <AvatarFallback className="rounded-none bg-gradient-to-br from-primary to-secondary">
                            <span className="text-3xl font-bold text-primary-foreground xl:text-4xl">
                              {displayName.charAt(0).toUpperCase()}
                            </span>
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <Skeleton className="h-full w-full rounded-none" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 xl:flex-none">
                      <h3 className="max-w-full text-balance text-base font-bold leading-snug text-foreground sm:text-lg">
                        {profileIsLoaded ? (
                          displayName
                        ) : (
                          <Skeleton className="h-7 w-48" />
                        )}
                      </h3>
                      <p className="mt-1 text-sm font-medium text-muted-foreground xl:mt-2">
                        {gradeLabel}
                      </p>
                    </div>
                  </div>

                  <div className="min-w-0 xl:border-l xl:border-border/60 xl:pl-5">
                    <div
                      className={cn(
                        "hidden xl:block",
                        editableStudentOrgId && "xl:pr-28",
                      )}
                    >
                      <h3 className="text-xl font-bold text-foreground">
                        {t("student.profile.classAttendance")}
                      </h3>
                      <p className="mt-1 text-sm font-medium text-muted-foreground">
                        {completedSessions > 0
                          ? t("student.profile.attendanceSummary", {
                              attended: attendedSessions,
                              completed: completedSessions,
                            })
                          : t("student.profile.noCompletedClassesYet")}
                      </p>
                    </div>

                    <div className="grid w-full grid-cols-3 gap-2 xl:mt-4 xl:gap-3">
                      <div className="min-w-0 rounded-2xl bg-success/50 px-2 py-2 text-center text-success-foreground xl:flex xl:min-h-24 xl:flex-col xl:items-center xl:justify-center xl:bg-success/60 xl:py-3">
                        <p className="text-xl font-bold leading-none tabular-nums xl:text-3xl">
                          {attendedSessions}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold leading-tight xl:mt-2 xl:text-sm">
                          {t("student.profile.classesAttendedShort")}
                        </p>
                      </div>
                      <div className="min-w-0 rounded-2xl bg-destructive/25 px-2 py-2 text-center text-destructive xl:flex xl:min-h-24 xl:flex-col xl:items-center xl:justify-center xl:bg-destructive/30 xl:py-3">
                        <p className="text-xl font-bold leading-none tabular-nums xl:text-3xl">
                          {missedSessions}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold leading-tight xl:mt-2 xl:text-sm">
                          {t("student.profile.classesNotAttendedShort")}
                        </p>
                      </div>
                      <div className="min-w-0 rounded-2xl bg-info/50 px-2 py-2 text-center text-info-foreground xl:flex xl:min-h-24 xl:flex-col xl:items-center xl:justify-center xl:bg-info/60 xl:py-3">
                        <p className="text-xl font-bold leading-none tabular-nums xl:text-3xl">
                          {upcomingCount}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold leading-tight xl:mt-2 xl:text-sm">
                          {t("student.profile.upcomingClassesShort")}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <section className="relative isolate order-3 flex min-h-0 flex-col overflow-hidden rounded-[2rem] bg-card p-5 shadow-md ring-1 ring-border/80 after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:z-10 after:hidden after:h-24 after:bg-gradient-to-b after:from-card after:via-card/90 after:to-card/0 after:content-[''] xl:order-none xl:min-h-0 xl:after:block">
                <div className="relative z-20">
                  <h2 className="text-xl font-bold text-foreground">
                    {t("student.myClasses")}
                  </h2>
                </div>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-16 right-0 z-20 w-12 bg-gradient-to-l from-card via-card/85 to-transparent xl:hidden"
                />
                <div className="relative z-0 mt-2 grid auto-cols-[minmax(220px,82%)] grid-flow-col gap-3 overflow-x-auto overscroll-x-contain pb-2 pr-8 snap-x snap-mandatory sm:auto-cols-[minmax(260px,48%)] lg:auto-cols-[minmax(280px,32%)] xl:min-h-0 xl:flex-1 xl:auto-cols-auto xl:grid-flow-row xl:grid-cols-2 xl:content-start xl:overflow-x-hidden xl:overflow-y-auto xl:overscroll-contain xl:pb-0 xl:pr-1 xl:snap-none xl:[scrollbar-gutter:stable]">
                  {classStats.length === 0 ? (
                    <div className="col-span-full flex h-full min-h-32 flex-col items-center justify-center rounded-2xl border border-dashed text-center text-muted-foreground">
                      <GraduationCap className="mb-2 h-8 w-8 opacity-60" />
                      <p className="px-4 text-sm font-medium">
                        {t("student.noClassesEnrolled")}
                      </p>
                    </div>
                  ) : (
                    classStats.map((classItem, index) => (
                      <div
                        key={classItem.classId}
                        className={cn(
                          "relative min-h-[76px] scroll-ml-1 snap-start overflow-hidden rounded-2xl border px-4 py-3 pl-5 shadow-sm transition-shadow before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full hover:shadow-md",
                          COURSE_CARD_ACCENTS[
                            index % COURSE_CARD_ACCENTS.length
                          ],
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">
                              {classItem.className}
                            </p>
                            <p className="line-clamp-1 text-xs text-muted-foreground">
                              {classItem.teacher.fullName}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            <aside className="order-2 grid xl:order-none xl:min-h-0">
              <section className="relative min-h-0 overflow-hidden rounded-[2rem] bg-warning p-3 shadow-lg before:absolute before:inset-0 before:bg-[url('/flexidual-bg-pattern.webp')] before:bg-cover before:bg-center before:bg-no-repeat before:opacity-30 sm:p-4 xl:min-h-0 xl:p-5">
                <div className="relative z-10 flex h-full min-h-0 flex-col items-center justify-start text-center xl:justify-center">
                  <div className="w-full max-w-md rounded-[1.5rem] bg-card/95 px-4 py-4 shadow-md ring-1 ring-border/30 sm:px-5 xl:rounded-[1.8rem] xl:px-6 xl:py-6">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      {t("student.nextClass")}:
                    </p>
                    {nextLesson && (
                      <div className="mt-2 flex justify-center xl:mt-3">
                        {isNextLessonLive ? (
                          <Badge className="gap-1.5 rounded-full bg-destructive px-2.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white shadow-sm shadow-destructive/20 ring-1 ring-destructive/20 hover:bg-destructive motion-safe:animate-pulse xl:px-3 xl:py-1 xl:text-xs">
                            <span className="relative flex h-1.5 w-1.5 xl:h-2 xl:w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white xl:h-2 xl:w-2" />
                            </span>
                            {t("student.liveNow")}
                          </Badge>
                        ) : (
                          <Badge className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-0.5 text-xs text-muted-foreground ring-1 ring-border/40 xl:gap-2 xl:px-3 xl:py-1 xl:text-sm">
                            <Clock className="h-3.5 w-3.5 xl:h-4 xl:w-4" />
                            <span className="tabular-nums">
                              {formatClassCountdown(nextLesson)}
                            </span>
                          </Badge>
                        )}
                      </div>
                    )}
                    <h3 className="mt-3 text-balance text-lg font-bold leading-tight text-foreground sm:text-xl xl:mt-4 xl:font-normal">
                      {nextLesson
                        ? nextLesson.className || nextLesson.title
                        : t("student.today.noClasses")}
                    </h3>
                    {nextLesson && !isViewingStudentProfile && (
                      <Button
                        onClick={() => handleClassroomCta(nextLesson)}
                        aria-busy={Boolean(ctaLaunchingLesson)}
                        className="group relative mt-4 h-10 overflow-hidden rounded-full bg-info px-6 text-sm font-bold text-info-foreground shadow-lg hover:bg-info/90 xl:mt-5 xl:h-11 xl:px-8 xl:text-base"
                      >
                        <RocketLaunchButtonContent
                          label={classroomCtaLabel}
                          isLaunching={Boolean(ctaLaunchingLesson)}
                          onComplete={handleClassroomCtaComplete}
                        />
                      </Button>
                    )}
                  </div>
                  {laterTodayLessons.length > 0 ? (
                    <div className="mt-3 w-full max-w-md rounded-[1.25rem] bg-card/90 p-3 text-left shadow-sm ring-1 ring-border/20 xl:mt-4 xl:rounded-[1.5rem] xl:p-4">
                      <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground xl:mb-3">
                        {t("student.today.laterToday")}
                      </p>
                      <div className="space-y-2 xl:space-y-3">
                        {laterTodayLessons.map((lesson) => (
                          <span
                            key={lesson.scheduleId}
                            className="block min-w-0"
                          >
                            <span className="line-clamp-1 text-sm font-bold text-foreground">
                              {lesson.className || lesson.title}
                            </span>
                            <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
                              {format(lesson.start, "h:mm a", {
                                locale: currentDateLocale,
                              })}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    nextLesson && (
                      <p className="mt-4 rounded-full bg-card/75 px-4 py-2 text-sm font-semibold text-foreground/75">
                        {t("student.today.doneForToday")}
                      </p>
                    )
                  )}
                  {!isViewingStudentProfile && (
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="mt-3 rounded-full bg-card/70 px-4 text-sm font-semibold text-foreground shadow-sm hover:bg-card"
                    >
                      <Link href={`${basePath}/calendar`}>
                        <CalendarDays className="size-4 text-info" />
                        {t("student.today.viewCalendar")}
                      </Link>
                    </Button>
                  )}
                </div>
              </section>
            </aside>
          </div>
        </div>
      )}

      {!isViewingStudentProfile && (isLaunching || activeLesson) && (
        <div className="min-h-0 flex-1">
          <ClassroomDropZone
            isDragging={false}
            isLaunching={isLaunching}
            activeLesson={activeLesson}
            onDrop={() => undefined}
            onLaunchComplete={handleLaunchComplete}
            onLeaveClassroom={handleExitClassroom}
          />
        </div>
      )}
    </div>
  );
}
