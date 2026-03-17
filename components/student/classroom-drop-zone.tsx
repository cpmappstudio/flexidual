"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useState, useMemo } from "react"
import { Rocket, Sparkles, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import FlexiClassroom from "@/components/classroom/flexi-classroom"
import { useTranslations } from "next-intl"
import { StudentScheduleEvent } from "@/lib/types/student"

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

  // Stars for launch animation
  const launchStars = useMemo(() => {
    return Array.from({ length: 50 }, (_, i) => ({
      id: i,
      left: `${(i * 13.7) % 100}%`,
      top: `${(i * 19.3) % 100}%`,
      duration: 1 + (i % 2),
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

  const isIgnitia = activeLesson?.sessionType === "ignitia"
  const isAbeka = activeLesson?.sessionType === "abeka"
  const isVirtual = isIgnitia || isAbeka
  
  const ignitiaUrl = "https://centralpointefl.ignitiaschools.com/owsoo/login/auth"
  const abekaUrl = "https://login.abeka.com/abekab2c.onmicrosoft.com/b2c_1a_signin_legacy/oauth2/v2.0/authorize?client_id=39dfdf7d-fa0c-41dc-ae8f-a7f2ead1e645&response_type=id_token&scope=openid%20profile&state=OpenIdConnect.AuthenticationProperties%3DTmtO36sXdnSSdnF5m0ICSuO0TiIc6mkpqMBYNRvFoE8zqfGTp9mR1wLWNVXb-FznJRpV18nEgJh44lBGQ1L7HpfdPU57UCQ92L4AF9wxYSF52KxGZ9RFKs9tB5FETopSF_3i0I469pko6gDsKSSIGw&response_mode=form_post&nonce=639084289217533065.OTEyYzk1NjAtY2U1Mi00N2Y2LWE5OWItZWM3MTY2NDhhZmRmZDQ2NGI4ZTAtY2EzZC00NTMwLWI0ZjgtYmQyNGFhNTg5ZGE5&redirect_uri=https%3A%2F%2Fathome.abeka.com%2Flogin.aspx&x-client-SKU=ID_NET472&x-client-ver=6.29.0.0"

  const platformUrl = isAbeka ? abekaUrl : ignitiaUrl;
  const platformName = isAbeka ? "Abeka" : "Ignitia";

  return (
    <div className="relative h-full w-full rounded-3xl overflow-hidden border-4 border-purple-400 dark:border-purple-600 shadow-2xl">
      <AnimatePresence mode="wait">
        {/* Rocket Launch Animation */}
        {isLaunching && (
          <motion.div
            key="launching"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-gradient-to-b from-blue-900 via-purple-900 to-pink-900 flex items-center justify-center"
          >
            {/* Stars background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {launchStars.map((star) => (
                <motion.div
                  key={star.id}
                  className="absolute w-1 h-1 bg-white rounded-full"
                  style={{
                    left: star.left,
                    top: star.top,
                  }}
                  animate={{
                    opacity: [0.2, 1, 0.2],
                    scale: [1, 1.5, 1],
                  }}
                  transition={{
                    duration: star.duration,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>

            {/* Rocket */}
            <motion.div
              initial={{ y: 100, rotate: 0, scale: 0.5 }}
              animate={{ y: -1000, rotate: -15, scale: 1.5 }}
              transition={{ duration: 2, ease: "easeIn" }}
              onAnimationComplete={onLaunchComplete}
              className="relative"
            >
              <Rocket className="w-32 h-32 text-orange-400" strokeWidth={1.5} />
              
              {/* Fire trail */}
              <motion.div
                className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-12"
                animate={{
                  scaleY: [1, 1.5, 1],
                  opacity: [0.8, 1, 0.8],
                }}
                transition={{
                  duration: 0.3,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <div className="bg-gradient-to-b from-yellow-400 via-orange-500 to-red-600 h-24 w-full rounded-b-full blur-sm" />
              </motion.div>
            </motion.div>

            {/* Text */}
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="absolute bottom-32 text-center px-4"
            >
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-2">
                🚀 {t('launchingClass')}
              </h2>
              <p className="text-lg sm:text-xl text-blue-200">{t('getReady')}</p>
            </motion.div>
          </motion.div>
        )}

        {/* Active Classroom */}
        {activeLesson && !isLaunching ? (
          <motion.div
            key="classroom"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="h-full w-full relative"
          >
            {isVirtual ? (
              <div className="h-full w-full flex flex-col bg-white dark:bg-gray-900">
                {/* Header for Virtual Frame */}
                <div className="h-12 sm:h-14 bg-gray-100 dark:bg-gray-800 border-b flex items-center justify-between px-3 sm:px-4 shrink-0 gap-2">
                   <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-bold text-gray-700 dark:text-gray-200 text-sm sm:text-base truncate">
                        {platformName}: {activeLesson.title}
                      </span>
                   </div>
                   <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                      <Button variant="ghost" size="sm" asChild className="hidden sm:flex">
                        <a href={platformUrl} target="_blank" rel="noopener noreferrer" className="text-xs">
                           <ExternalLink className="w-4 h-4 mr-1" />
                           Open in new tab
                        </a>
                      </Button>
                      <Button variant="ghost" size="icon" asChild className="sm:hidden">
                        <a href={platformUrl} target="_blank" rel="noopener noreferrer">
                           <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                      <Button variant="destructive" size="sm" onClick={onLeaveClassroom} className="text-xs sm:text-sm">
                        <span className="hidden sm:inline">Close Session</span>
                        <span className="sm:hidden">Close</span>
                      </Button>
                   </div>
                </div>
                
                {/* The Iframe */}
                {isAbeka ? (
                  <div className="flex-1 w-full h-full flex flex-col items-center justify-center bg-blue-50/50 dark:bg-blue-900/10 p-6 text-center">
                    <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center mb-6 shadow-inner">
                      <ExternalLink className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">
                      Secure Login Required
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md">
                      For security reasons, Abeka requires you to log in through their official, secure page. Please launch the lesson in a new tab.
                    </p>
                    <Button 
                      size="lg" 
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-8 py-6 text-lg shadow-lg hover:shadow-xl transition-all" 
                      asChild
                    >
                      <a href={platformUrl} target="_blank" rel="noopener noreferrer">
                        Launch Abeka Lesson
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
            ) : (
              /* Standard LiveKit Classroom */
              <FlexiClassroom 
                roomName={activeLesson.roomName} 
                className={activeLesson.className}
                isStudentView={true}
                onLeave={onLeaveClassroom}
              />
            )}
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
              bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500
              relative overflow-hidden
              transition-all duration-300
              ${isDragging ? 'scale-105 shadow-2xl' : ''}
              ${isHovering ? 'ring-8 ring-yellow-400 ring-opacity-50' : ''}
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
                  <Sparkles className="w-4 h-4 sm:w-6 sm:h-6 text-yellow-300" />
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
              <Rocket className="w-32 h-32 sm:w-40 sm:h-40 lg:w-48 lg:h-48 text-white drop-shadow-2xl" strokeWidth={1.5} />
              
              {/* Pulsing glow */}
              <motion.div
                className="absolute inset-0 bg-white rounded-full blur-3xl opacity-50"
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
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-3 sm:mb-4 drop-shadow-lg">
                {isDragging ? `🎯 ${t('dropHere')}` : `🚀 ${t('readyForClass')}`}
              </h2>
              <p className="text-lg sm:text-xl lg:text-2xl text-white/90 font-bold drop-shadow-md">
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