"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useUser } from "@clerk/nextjs"
import { DraggableLessonCard } from "@/components/student/draggable-lesson-card"
import { ClassroomDropZone } from "@/components/student/classroom-drop-zone"
import { ScrollIndicator } from "@/components/student/scroll-indicator"
import { FlexidualLogo } from "@/components/ui/flexidual-logo"
import { AccountMenu } from "@/components/account-menu"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { History, Calendar as CalendarIcon, BellRing, BookOpen, GraduationCap, Menu, X, Volume2, VolumeX } from "lucide-react"
import { useTranslations, useLocale } from "next-intl"
import { enUS, es, ptBR } from "date-fns/locale"
import { StudentScheduleEvent } from "@/lib/types/student"

import { StudentProfileHero } from "@/components/student/student-profile-hero"
import { StudentClassCard } from "@/components/student/student-class-card"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

function CountdownToast({
  lesson,
  onStop,
  onGoToClass,
  title,
  stopLabel,
  goToClassLabel
}: {
  lesson: StudentScheduleEvent
  onStop: () => void
  onGoToClass: () => void
  title: string
  stopLabel: string
  goToClassLabel: string
}) {
  const [timeLeft, setTimeLeft] = useState(() => lesson.start - Date.now())

  useEffect(() => {
    const tick = setInterval(() => {
      const remaining = lesson.start - Date.now()
      setTimeLeft(remaining)
      if (remaining <= 0) clearInterval(tick)
    }, 1000)
    return () => clearInterval(tick)
  }, [lesson.start])

  const formatted = () => {
    if (timeLeft <= 0) return '🔔 Now!'
    const m = Math.floor(timeLeft / 60000)
    const s = Math.floor((timeLeft % 60000) / 1000)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="bg-card rounded-2xl shadow-2xl border-2 border-warning/30 overflow-hidden w-[340px]">
      {/* Header strip */}
      <div className="bg-warning px-4 py-2 flex items-center gap-2">
        <BellRing className="w-4 h-4 text-warning-foreground animate-bounce flex-shrink-0" />
        <p className="text-warning-foreground font-bold text-sm truncate flex-1">{title}</p>
        <span className={cn(
          "font-mono font-black text-warning-foreground text-lg tabular-nums",
          timeLeft <= 0 && "animate-pulse"
        )}>
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
  )
}

export default function StudentHubPage() {
  const t = useTranslations()
  const locale = useLocale()
  const { user } = useUser()
  const currentDateLocale = locale === 'es' ? es : locale === 'pt-BR' ? ptBR : enUS

  const [isDragging, setIsDragging] = useState(false)
  const [draggedLesson, setDraggedLesson] = useState<StudentScheduleEvent | null>(null)
  const [activeLesson, setActiveLesson] = useState<StudentScheduleEvent | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isLaunching, setIsLaunching] = useState(false)
  const [now, setNow] = useState(Date.now)

  const upcomingScrollRef = useRef<HTMLDivElement>(null)
  const pastScrollRef = useRef<HTMLDivElement>(null)
  const liveScrollRef = useRef<HTMLDivElement>(null)

  const [notifiedLessons, setNotifiedLessons] = useState<Set<string>>(new Set())

  const [soundEnabled, setSoundEnabled] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const alarmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const soundEnabledRef = useRef(soundEnabled)
  const startAlarmRef = useRef<() => void>(() => {})
  const handleLessonTapRef = useRef<(lesson: StudentScheduleEvent) => void>(() => {})

  const playRocketSound = () => {
    if (!soundEnabledRef.current) return
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext()
      }
      const ctx = audioCtxRef.current

      // Master limiter — prevents any clipping regardless of how layers sum
      const limiter = ctx.createDynamicsCompressor()
      limiter.threshold.value = -3   // dB — start compressing just below 0
      limiter.knee.value = 0         // hard knee
      limiter.ratio.value = 20       // brick-wall limiting
      limiter.attack.value = 0.001
      limiter.release.value = 0.1
      limiter.connect(ctx.destination)

      const duration = 2.4
      const t0 = ctx.currentTime

      // ── Noise layer ──────────────────────────────────────────────────────
      const bufferSize = ctx.sampleRate * duration
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = noiseBuffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1

      const noise = ctx.createBufferSource()
      noise.buffer = noiseBuffer

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(80, t0)
      filter.frequency.exponentialRampToValueAtTime(900, t0 + duration)
      filter.Q.value = 1.2           // reduced from 2.5 — less resonant spike

      const bass = ctx.createBiquadFilter()
      bass.type = 'lowshelf'
      bass.frequency.value = 120
      bass.gain.value = 7            // reduced from 14 — still deep, won't clip

      const noiseGain = ctx.createGain()
      noiseGain.gain.setValueAtTime(0, t0)
      noiseGain.gain.linearRampToValueAtTime(0.45, t0 + 0.15)  // reduced from 0.9
      noiseGain.gain.setValueAtTime(0.45, t0 + 1.0)
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + duration)

      noise.connect(filter)
      filter.connect(bass)
      bass.connect(noiseGain)
      noiseGain.connect(limiter)
      noise.start(t0)
      noise.stop(t0 + duration)

      // ── Sub-bass rumble ───────────────────────────────────────────────────
      const sub = ctx.createOscillator()
      const subGain = ctx.createGain()
      sub.type = 'sine'
      sub.frequency.setValueAtTime(30, t0)
      sub.frequency.exponentialRampToValueAtTime(180, t0 + 1.6)
      subGain.gain.setValueAtTime(0, t0)
      subGain.gain.linearRampToValueAtTime(0.18, t0 + 0.05)
      subGain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.6)
      sub.connect(subGain)
      subGain.connect(limiter)
      sub.start(t0)
      sub.stop(t0 + 1.6)

      // ── Harmonic warmth ───────────────────────────────────────────────────
      const osc2 = ctx.createOscillator()
      const osc2Gain = ctx.createGain()
      osc2.type = 'triangle'
      osc2.frequency.setValueAtTime(55, t0)
      osc2.frequency.exponentialRampToValueAtTime(220, t0 + 1.8)
      osc2Gain.gain.setValueAtTime(0, t0)
      osc2Gain.gain.linearRampToValueAtTime(0.12, t0 + 0.05)
      osc2Gain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.8)
      osc2.connect(osc2Gain)
      osc2Gain.connect(limiter)
      osc2.start(t0)
      osc2.stop(t0 + 1.8)
    } catch { /* non-critical */ }
  }

  // Queries
  const events = useQuery(api.schedule.getMySchedule, {})
  const accessibleLiveClasses = useQuery(api.schedule.listAccessibleLiveClasses)
  const dashboardData = useQuery(api.student.getStudentDashboardStats)

  useEffect(() => {
    const stored = localStorage.getItem('flexidual_sound_alerts');
    if (stored !== 'true') return;
    setSoundEnabled(true);
    soundEnabledRef.current = true;

    // Create AudioContext on first interaction (satisfies autoplay policy)
    const unlock = () => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext()
      }
      window.removeEventListener('click', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('click', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('click', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => { soundEnabledRef.current = soundEnabled }, [soundEnabled])

  const { upcomingLessons, pastLessons } = useMemo(() => {
    if (!events) return { upcomingLessons: [], pastLessons: [] }

    const upcoming = events
      .filter(e => e.end > now)
      .sort((a, b) => a.start - b.start)

    const past = events
      .filter(e => e.end <= now)
      .sort((a, b) => b.start - a.start)
      .slice(0, 20)

    return { upcomingLessons: upcoming, pastLessons: past }
  }, [events, now])

  const needsAttention = upcomingLessons.some(l => {
    const timeToStart = l.start - now;
    const isUrgent = timeToStart > 0 && timeToStart <= 5 * 60 * 1000;
    const isLate = now >= l.start && now < l.end && !l.isStudentActive && l.attendance !== "present";
    return isUrgent || isLate;
  });

  // Notification System
  useEffect(() => {
    if (upcomingLessons.length === 0) return;

    const checkNotifications = () => {
        const currentTime = Date.now();
        upcomingLessons.forEach(lesson => {
            const timeDiff = lesson.start - currentTime;
            const minutesLeft = timeDiff / 60000;

            if (minutesLeft <= 5 && minutesLeft > 0 && !notifiedLessons.has(lesson.scheduleId)) {
              if (soundEnabledRef.current) {
                startAlarmRef.current()
              }

              toast.custom(
                () => (
                  <CountdownToast
                    lesson={lesson}
                    onStop={() => {
                      stopAlarm()
                      toast.dismiss(lesson.scheduleId)
                    }}
                    onGoToClass={() => {
                      handleLessonTapRef.current(lesson)
                      toast.dismiss(lesson.scheduleId)
                    }}
                    title={t('schedule.classStartingSoon')}
                    stopLabel={t('common.muteAlarm') || 'Stop'}
                    goToClassLabel={t('dashboard.goToClassroom') || 'Go to Class'}
                  />
                ),
                {
                  id: lesson.scheduleId,
                  duration: 30000,
                  onDismiss: stopAlarm,
                  onAutoClose: stopAlarm,
                }
              )
              setNotifiedLessons(prev => new Set(prev).add(lesson.scheduleId));
            }
        });
    };
    const interval = setInterval(checkNotifications, 15000);
    return () => clearInterval(interval);
  }, [upcomingLessons, notifiedLessons, t]);

  const handleDragStart = (lesson: StudentScheduleEvent) => {
    console.log('🎯 Drag Start:', lesson.title)
    setIsDragging(true)
    setDraggedLesson(lesson)
    setSidebarOpen(false)
  }

  const handleDragEnd = () => {
    console.log('🎯 Drag End')
    setIsDragging(false)
    // Don't clear draggedLesson here - we need it for the drop
  }

  const handleDrop = () => {
    console.log('🎯 Drop detected, draggedLesson:', draggedLesson?.title)
    if (draggedLesson) {
      setIsDragging(false)
      playRocketSound()
      setIsLaunching(true)
    }
  }

  // Mobile tap handler - triggers launch animation
  const handleLessonTap = (lesson: StudentScheduleEvent) => {
    stopAlarm()
    console.log('📱 Tap detected:', lesson.title)
    setDraggedLesson(lesson)
    setSidebarOpen(false)
    playRocketSound()
    setIsLaunching(true)
  }

  const handleLaunchComplete = () => {
    stopAlarm()
    console.log('🚀 Launch Complete, setting active lesson:', draggedLesson?.title)
    if (draggedLesson) {
      setIsLaunching(false)
      setActiveLesson(draggedLesson)
      setDraggedLesson(null)
    }
  }

  const handleExitClassroom = () => {
    console.log('👋 Exiting classroom')
    setActiveLesson(null)
    setDraggedLesson(null)
    setIsLaunching(false)
    setIsDragging(false)
  }

  const playChime = async (invert: boolean = false) => {
    const ctx = audioCtxRef.current
    if (!ctx) return
    if (ctx.state === 'suspended') await ctx.resume()

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(invert ? 440 : 1000, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(invert ? 1000 : 440, ctx.currentTime + 0.3)
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
  }

  const startAlarm = () => {
    if (alarmIntervalRef.current) return
    playChime()
    alarmIntervalRef.current = setInterval(playChime, 1000)
  }

  const stopAlarm = () => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current)
      alarmIntervalRef.current = null
    }
  }

  startAlarmRef.current = startAlarm
  handleLessonTapRef.current = handleLessonTap

  const toggleSound = () => {
    const nextState = !soundEnabled
    setSoundEnabled(nextState)
    soundEnabledRef.current = nextState
    localStorage.setItem('flexidual_sound_alerts', String(nextState))

    if (nextState) {
      // AudioContext must be created/resumed inside a user gesture
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext()
      }
      audioCtxRef.current.resume().then(() => playChime(true)) // confirmation chime
    } else {
      stopAlarm()
    }
  }

  const classStats = dashboardData?.classes
  const studentProfile = dashboardData?.student
  const overallStats = dashboardData?.overall

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-gradient-to-br from-background to-muted">
      {/* Top Bar */}
      <div className="h-16 lg:h-20 bg-card/80 backdrop-blur-md border-b-4 border-primary flex items-center justify-between px-4 lg:px-6 shadow-lg flex-shrink-0 z-20">
        {/* Mobile Menu Button */}
        <Button
          variant="ghost"
          size="icon"
          className="xl:hidden rounded-full hover:bg-accent relative"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}

          {/* The Indicator Badge */}
          {!sidebarOpen && needsAttention && (
            <span className="absolute top-1 right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive border-2 border-card"></span>
            </span>
          )}
        </Button>

        <FlexidualLogo />

        <div className="flex items-center gap-2 lg:gap-4">
          <div className="hidden xl:block text-right">
            <p className="text-lg font-black bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              {t('student.welcome', { name: user?.firstName || user?.username || 'Student' })}
            </p>
            <p className="text-sm text-muted-foreground font-medium">
              {t('student.welcomeMessage')}
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSound}
            className={`rounded-full h-9 w-9 lg:h-10 lg:w-10 border-2 transition-colors ${
              soundEnabled
                ? 'bg-success/10 border-success/30 text-success'
                                : 'bg-muted border-border text-muted-foreground'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 lg:w-5 lg:h-5" /> : <VolumeX className="w-4 h-4 lg:w-5 lg:h-5" />}
          </Button>

          <AccountMenu />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex gap-0 lg:gap-4 lg:p-4 overflow-hidden min-h-0 relative z-10">

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-inverse/50 z-30 xl:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Left Sidebar - Schedule */}
        <div className={cn(
          "fixed xl:relative z-40 w-80 xl:w-96",
          "bg-card/90 backdrop-blur-md",
          "xl:rounded-3xl border-r-4 xl:border-4 border-primary shadow-2xl",
          "flex flex-col overflow-hidden flex-shrink-0 transition-transform duration-300",
          "top-16 lg:top-20 xl:top-0 bottom-0 xl:inset-y-0 left-0 z-100",
          !sidebarOpen && "-translate-x-full xl:translate-x-0"
        )}>
          <Tabs defaultValue="upcoming" className="flex-1 flex flex-col min-h-0">
            <div className="p-3 lg:p-4 border-b-2 border-primary/20 flex-shrink-0">
                          <TabsList className="grid w-full grid-cols-3 bg-primary/10">
                <TabsTrigger
                  value="upcoming"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all text-xs sm:text-sm"
                >
                  <CalendarIcon className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">{t('student.upcoming')}</span>
                  <span className="sm:hidden">{t('schedule.upcoming')}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="past"
                  className="data-[state=active]:bg-neutral-status data-[state=active]:text-neutral-status-foreground transition-all text-xs sm:text-sm"
                >
                  <History className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">{t('student.history')}</span>
                  <span className="sm:hidden">{t('schedule.past')}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="live"
                  className="data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground transition-all text-xs sm:text-sm"
                >
                  <BellRing className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  {t('student.liveNow')}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="upcoming" className="flex-1 min-h-0 m-0 relative">
              <div ref={upcomingScrollRef} className="h-full overflow-y-auto p-3 lg:p-4 space-y-3 lg:space-y-4 scrollbar-hide">
                {upcomingLessons.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6 lg:p-8 opacity-70">
                    <div className="text-4xl lg:text-6xl mb-3 lg:mb-4 animate-bounce">🎉</div>
                    <h3 className="text-xl lg:text-2xl font-bold text-muted-foreground mb-2">{t('student.noUpcoming')}</h3>
                    <p className="text-sm lg:text-base text-muted-foreground">{t('student.enjoyFreeTime')}</p>
                  </div>
                ) : (
                  upcomingLessons.map((lesson) => (
                    <DraggableLessonCard
                      key={lesson.scheduleId}
                      lesson={lesson}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onTap={handleLessonTap}
                    />
                  ))
                )}
              </div>
              <ScrollIndicator containerRef={upcomingScrollRef} />
            </TabsContent>

            <TabsContent value="past" className="flex-1 min-h-0 m-0 relative">
              <div ref={pastScrollRef} className="h-full overflow-y-auto p-3 lg:p-4 space-y-3 lg:space-y-4 scrollbar-hide">
                {pastLessons.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6 lg:p-8 opacity-70">
                    <div className="text-4xl lg:text-6xl mb-3 lg:mb-4">📚</div>
                    <h3 className="text-xl lg:text-2xl font-bold text-muted-foreground mb-2">{t('student.noPast')}</h3>
                  </div>
                ) : (
                  pastLessons.map((lesson) => (
                    <DraggableLessonCard
                      key={lesson.scheduleId}
                      lesson={lesson}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onTap={handleLessonTap}
                      isPast
                    />
                  ))
                )}
              </div>
              <ScrollIndicator containerRef={pastScrollRef} />
            </TabsContent>

            <TabsContent value="live" className="flex-1 min-h-0 m-0 relative">
              <div ref={liveScrollRef} className="h-full overflow-y-auto p-3 lg:p-4 space-y-3 lg:space-y-4 scrollbar-hide">
                {accessibleLiveClasses === undefined ? (
                  <div className="flex h-full items-center justify-center text-sm font-medium text-muted-foreground">
                    {t('student.loadingLiveClasses')}
                  </div>
                ) : accessibleLiveClasses.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6 lg:p-8 opacity-70">
                    <div className="text-4xl lg:text-6xl mb-3 lg:mb-4">📡</div>
                    <h3 className="text-xl lg:text-2xl font-bold text-muted-foreground mb-2">{t('student.noLiveClasses')}</h3>
                  </div>
                ) : (
                  accessibleLiveClasses.map((lesson) => (
                    <DraggableLessonCard
                      key={lesson.scheduleId}
                      lesson={lesson}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onTap={handleLessonTap}
                    />
                  ))
                )}
              </div>
              <ScrollIndicator containerRef={liveScrollRef} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Area - Dynamic: Dashboard Grid OR Drop Zone */}
        <div className="flex-1 relative min-w-0 flex flex-col">
          {!isDragging && !activeLesson && !isLaunching && (
            <div className="absolute inset-0 p-2 sm:p-3 lg:p-2 overflow-y-auto scrollbar-student">

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6 pb-16 lg:pb-20">
                {studentProfile && overallStats && (
                    <StudentProfileHero
                        student={studentProfile}
                        stats={overallStats}
                        classes={classStats}
                        disableCamera={!!activeLesson || isLaunching}
                    />
                )}

                <div className="col-span-full mt-2 lg:mt-4 flex items-center justify-between px-2">
                    <h2 className="text-xl sm:text-2xl font-black text-foreground flex items-center gap-2 lg:gap-3">
                      <GraduationCap className="w-5 h-5 lg:w-6 lg:h-6 text-primary" />
                      {t('student.myClasses')}
                    </h2>
                </div>

                {classStats?.map((stat) => (
                  <StudentClassCard
                    key={stat.classId}
                    stat={stat}
                    currentDateLocale={currentDateLocale}
                  />
                ))}

                {/* Empty State if no classes */}
                {classStats?.length === 0 && (
                  <div className="col-span-full h-48 sm:h-64 flex flex-col items-center justify-center text-muted-foreground border-4 border-dashed border-border rounded-2xl sm:rounded-3xl">
                     <BookOpen className="w-12 h-12 sm:w-16 sm:h-16 mb-3 sm:mb-4 opacity-50" />
                     <p className="text-lg sm:text-xl font-medium px-4 text-center">{t('student.noClassesEnrolled')}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {(isDragging || isLaunching || activeLesson) && (
            <div className="absolute inset-0 z-50">
                <ClassroomDropZone
                    isDragging={isDragging}
                    isLaunching={isLaunching}
                    activeLesson={activeLesson}
                    onDrop={handleDrop}
                    onLaunchComplete={handleLaunchComplete}
                    onLeaveClassroom={handleExitClassroom}
                />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
