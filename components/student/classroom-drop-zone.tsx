"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useState, useMemo } from "react"
import { Rocket, Sparkles, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button";
import FlexiClassroom from "@/components/classroom/flexi-classroom"
import { useTranslations } from "next-intl"
import { StudentScheduleEvent } from "@/lib/types/student"

interface ClassroomDropZoneProps {
  isDragging: boolean
  activeLesson: StudentScheduleEvent | null
  onDrop: () => void
  onLaunchComplete: () => void
  onLeaveClassroom: () => void
}

export function ClassroomDropZone({ isDragging, activeLesson, onDrop, onLaunchComplete, onLeaveClassroom }: ClassroomDropZoneProps) {
  const t = useTranslations('student')
  const [isHovering, setIsHovering] = useState(false)
  const [isLaunching, setIsLaunching] = useState(false)
  const [launchedLesson, setLaunchedLesson] = useState<StudentScheduleEvent | null>(null)

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
    setIsLaunching(true)
    onDrop()
  }

  const handleRocketComplete = () => {
    setIsLaunching(false)
    setLaunchedLesson(activeLesson)
    onLaunchComplete()
  }

  const handleLeaveClassroom = () => {
    setLaunchedLesson(null)
    onLeaveClassroom()
  }

  const isIgnitia = launchedLesson?.sessionType === "ignitia";
  const ignitiaUrl = "https://ignitiumwa.ignitiaschools.com/owsoo/login/auth/true";

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
              onAnimationComplete={handleRocketComplete}
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
              className="absolute bottom-32 text-center"
            >
              <h2 className="text-4xl font-bold text-white mb-2">
                🚀 {t('launchingClass')}
              </h2>
              <p className="text-xl text-blue-200">{t('getReady')}</p>
            </motion.div>
          </motion.div>
        )}

        {/* Active Classroom */}
        {launchedLesson && !isLaunching ? (
          <motion.div
            key="classroom"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="h-full w-full relative"
          >
            {isIgnitia ? (
              <div className="h-full w-full flex flex-col bg-white">
                {/* Header for Ignitia Frame */}
                <div className="h-12 bg-gray-100 dark:bg-gray-800 border-b flex items-center justify-between px-4 shrink-0">
                   <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-700 dark:text-gray-200">
                        Ignitia: {launchedLesson.title}
                      </span>
                   </div>
                   <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" asChild>
                        <a href={ignitiaUrl} target="_blank" rel="noopener noreferrer" className="text-xs">
                           <ExternalLink className="w-4 h-4 mr-1" />
                           Open in new tab
                        </a>
                      </Button>
                      <Button variant="destructive" size="sm" onClick={handleLeaveClassroom}>
                        Close Session
                      </Button>
                   </div>
                </div>
                
                {/* The Iframe */}
                <iframe 
                  src={ignitiaUrl}
                  className="flex-1 w-full h-full border-0"
                  allow="microphone; camera; fullscreen; display-capture"
                  title="Ignitia Lesson"
                />
              </div>
            ) : (
              /* Standard LiveKit Classroom */
              <FlexiClassroom 
                roomName={launchedLesson.roomName} 
                className={launchedLesson.className}
                isStudentView={true}
                onLeave={handleLeaveClassroom}
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
            <div className="absolute inset-0 pointer-events-none">
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
                  <Sparkles className="w-6 h-6 text-yellow-300" />
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
              <Rocket className="w-48 h-48 text-white drop-shadow-2xl" strokeWidth={1.5} />
              
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
              className="mt-8 text-center z-10"
            >
              <h2 className="text-5xl font-black text-white mb-4 drop-shadow-lg">
                {isDragging ? `🎯 ${t('dropHere')}` : `🚀 ${t('readyForClass')}`}
              </h2>
              <p className="text-2xl text-white/90 font-bold drop-shadow-md">
                {isDragging ? t('releaseToLaunch') : t('dragToStart')}
              </p>
            </motion.div>

            {/* Animated arrow */}
            {isDragging && (
              <motion.div
                animate={{ y: [0, 20, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="mt-8 text-6xl"
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