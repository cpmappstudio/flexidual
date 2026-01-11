"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useState } from "react"
import { Rocket, Sparkles } from "lucide-react"
import FlexiClassroom from "@/components/classroom/flexi-classroom"
import { useTranslations } from "next-intl"
import { StudentScheduleEvent } from "@/lib/types/student"


interface ClassroomDropZoneProps {
  isDragging: boolean
  activeLesson: StudentScheduleEvent | null
  onDrop: () => void
}

export function ClassroomDropZone({ isDragging, activeLesson, onDrop }: ClassroomDropZoneProps) {
  const t = useTranslations()
  const [isHovering, setIsHovering] = useState(false)

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

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative h-full w-full rounded-3xl overflow-hidden"
    >
      <AnimatePresence mode="wait">
        {activeLesson ? (
          <motion.div
            key="classroom"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="h-full w-full"
          >
            <FlexiClassroom roomName={activeLesson.roomName} className={activeLesson.className} />
          </motion.div>
        ) : (
          <motion.div
            key="placeholder"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
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
            <div className="absolute inset-0">
              {Array.from({ length: 20 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute"
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                  }}
                  animate={{
                    y: [0, -20, 0],
                    opacity: [0.3, 1, 0.3],
                    scale: [1, 1.2, 1],
                  }}
                  transition={{
                    duration: Math.random() * 3 + 2,
                    repeat: Infinity,
                    delay: Math.random() * 2,
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
                {isDragging ? "🎯 Drop Here!" : "🚀 Ready for Class?"}
              </h2>
              <p className="text-2xl text-white/90 font-bold drop-shadow-md">
                {isDragging 
                  ? "Release to launch!" 
                  : "Drag a lesson card here to start"}
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