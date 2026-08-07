"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useState, useMemo } from "react"
import Image from "next/image"
import { Sparkles, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"
import { StudentScheduleEvent } from "@/lib/types/student"
import { RocketTransition } from "@/components/student/rocket-transition"

interface ClassroomDropZoneProps {
  isDragging: boolean
  isLaunching: boolean
  activeLesson: StudentScheduleEvent | null
  onDrop: () => void
  onLaunchComplete: () => void
  onLeaveClassroom: () => void
}

export function ClassroomDropZone({ 
  isDragging, 
  isLaunching,
  activeLesson, 
  onDrop, 
  onLaunchComplete, 
  onLeaveClassroom 
}: ClassroomDropZoneProps) {
  const t = useTranslations('student')
  const tClassroom = useTranslations('classroom')
  const [isHovering, setIsHovering] = useState(false)

  // Generate stable star positions (only once, not on every render)
  const stars = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: `${(i * 17.3) % 100}%`,
      top: `${(i * 23.7) % 100}%`,
      delay: (i * 0.1) % 2,
      duration: 2 + (i % 3),
    }))
  }, [])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsHovering(true)
  }

  const handleDragLeave = () => {
    setIsHovering(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsHovering(false)
    onDrop()
  }

  const isAbeka = activeLesson?.sessionType === "abeka"
  
  const ignitiaUrl = "https://centralpointefl.ignitiaschools.com/owsoo/login/auth"
  const abekaUrl = "https://login.abeka.com/abekab2c.onmicrosoft.com/b2c_1a_signin_legacy/oauth2/v2.0/authorize?client_id=39dfdf7d-fa0c-41dc-ae8f-a7f2ead1e645&response_type=id_token&scope=openid%20profile&state=OpenIdConnect.AuthenticationProperties%3DTmtO36sXdnSSdnF5m0ICSuO0TiIc6mkpqMBYNRvFoE8zqfGTp9mR1wLWNVXb-FznJRpV18nEgJh44lBGQ1L7HpfdPU57UCQ92L4AF9wxYSF52KxGZ9RFKs9tB5FETopSF_3i0I469pko6gDsKSSIGw&response_mode=form_post&nonce=639084289217533065.OTEyYzk1NjAtY2U1Mi00N2Y2LWE5OWItZWM3MTY2NDhhZmRmZDQ2NGI4ZTAtY2EzZC00NTMwLWI0ZjgtYmQyNGFhNTg5ZGE5&redirect_uri=https%3A%2F%2Fathome.abeka.com%2Flogin.aspx&x-client-SKU=ID_NET472&x-client-ver=6.29.0.0"

  const platformUrl = isAbeka ? abekaUrl : ignitiaUrl;
  const platformName = isAbeka ? "Abeka" : "Ignitia";

  return (
    <div
      className={`relative h-full w-full overflow-hidden ${
        activeLesson
          ? ""
          : "rounded-3xl border-4 border-primary shadow-2xl"
      }`}
    >
      <AnimatePresence>
        {/* Rocket Launch Animation */}
        {isLaunching && (
          <RocketTransition onComplete={onLaunchComplete} />
        )}

        {/* Active Classroom */}
        {activeLesson ? (
          <motion.div
            key="classroom"
            className="h-full w-full relative"
          >
            <div className="h-full w-full flex flex-col bg-card text-card-foreground">
                {/* Header for Virtual Frame */}
                <div className="h-12 sm:h-14 bg-muted border-b flex items-center justify-between px-3 sm:px-4 shrink-0 gap-2">
                   <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-bold text-foreground text-sm sm:text-base truncate">
                        {platformName}: {activeLesson.title}
                      </span>
                   </div>
                   <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                      <Button variant="ghost" size="sm" asChild className="hidden sm:flex">
                        <a href={platformUrl} target="_blank" rel="noopener noreferrer" className="text-xs">
                           <ExternalLink className="w-4 h-4 mr-1" />
                           {tClassroom('openInNewTab')}
                        </a>
                      </Button>
                      <Button variant="ghost" size="icon" asChild className="sm:hidden">
                        <a href={platformUrl} target="_blank" rel="noopener noreferrer">
                           <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                      <Button variant="destructive" size="sm" onClick={onLeaveClassroom} className="text-xs sm:text-sm">
                        <span className="hidden sm:inline">{tClassroom('closeSession')}</span>
                        <span className="sm:hidden">{t('common.close') || 'Close'}</span>
                      </Button>
                   </div>
                </div>
                
                {/* The Content Area: Iframe OR External Launch */}
                {isAbeka ? (
                  <div className="flex-1 w-full h-full flex flex-col items-center justify-center bg-info/10 p-6 text-center">
                    <div className="w-20 h-20 bg-info/20 rounded-full flex items-center justify-center mb-6 shadow-inner">
                      <ExternalLink className="w-10 h-10 text-info" />
                    </div>
                    <h3 className="text-2xl font-bold text-foreground mb-2">
                      {tClassroom('secureLoginRequired')}
                    </h3>
                    <p className="text-muted-foreground mb-8 max-w-md">
                      {tClassroom('abekaStudentSecurityMsg')}
                    </p>
                    <Button 
                      size="lg" 
                      className="bg-info hover:bg-info/90 text-info-foreground rounded-full px-8 py-6 text-lg shadow-lg hover:shadow-xl transition-all"
                      asChild
                    >
                      <a href={platformUrl} target="_blank" rel="noopener noreferrer">
                        {tClassroom('launchAbeka')}
                        <ExternalLink className="w-5 h-5 ml-2" />
                      </a>
                    </Button>
                  </div>
                ) : (
                  <iframe 
                    src={platformUrl}
                    className="flex-1 w-full h-full border-0"
                    allow="microphone; camera; fullscreen; display-capture"
                    title={`${platformName} Lesson`}
                  />
                )}
            </div>
          </motion.div>
        ) : !isLaunching && (
          /* Waiting Screen */
          <motion.div
            key="waiting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              h-full w-full flex flex-col items-center justify-center
              bg-gradient-to-br from-primary via-primary to-secondary
              relative overflow-hidden
              transition-all duration-300
              ${isDragging ? 'scale-105 shadow-2xl' : ''}
              ${isHovering ? 'ring-8 ring-warning ring-opacity-50' : ''}
            `}
          >
            {/* Animated stars */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {stars.map((star) => (
                <motion.div
                  key={star.id}
                  className="absolute"
                  style={{
                    left: star.left,
                    top: star.top,
                  }}
                  animate={{
                    y: [0, -20, 0],
                    opacity: [0.3, 1, 0.3],
                    scale: [1, 1.2, 1],
                  }}
                  transition={{
                    duration: star.duration,
                    repeat: Infinity,
                    delay: star.delay,
                  }}
                >
                  <Sparkles className="w-4 h-4 sm:w-6 sm:h-6 text-warning" />
                </motion.div>
              ))}
            </div>

            {/* Rocket */}
            <motion.div
              animate={isDragging ? {
                y: [0, -20, 0],
                rotate: [0, -5, 5, 0],
              } : {}}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="relative z-10"
            >
              <Image
                src="/rocket.svg"
                alt=""
                width={192}
                height={164}
                aria-hidden="true"
                className="h-auto w-32 drop-shadow-2xl sm:w-40 lg:w-48"
              />
              
              {/* Pulsing glow */}
              <motion.div
                className="absolute inset-0 bg-primary-foreground rounded-full blur-3xl opacity-50"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            </motion.div>

            {/* Text */}
            <motion.div
              animate={isDragging ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 1, repeat: Infinity }}
              className="mt-6 sm:mt-8 text-center z-10 px-4"
            >
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-primary-foreground mb-3 sm:mb-4 drop-shadow-lg">
                {isDragging ? `🎯 ${t('dropHere')}` : `🚀 ${t('readyForClass')}`}
              </h2>
              <p className="text-lg sm:text-xl lg:text-2xl text-primary-foreground/90 font-bold drop-shadow-md">
                {isDragging ? t('releaseToLaunch') : t('dragOrTapToStart')}
              </p>
            </motion.div>

            {/* Animated arrow */}
            {isDragging && (
              <motion.div
                animate={{ y: [0, 20, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="mt-6 sm:mt-8 text-4xl sm:text-5xl lg:text-6xl"
              >
                ⬇️
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
