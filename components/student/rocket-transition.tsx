"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Rocket } from "lucide-react"

interface RocketTransitionProps {
  isLaunching: boolean
  onComplete: () => void
}

export function RocketTransition({ isLaunching, onComplete }: RocketTransitionProps) {
  return (
    <AnimatePresence>
      {isLaunching && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-gradient-to-b from-blue-900 via-purple-900 to-pink-900 flex items-center justify-center"
        >
          {/* Stars background */}
          <div className="absolute inset-0 overflow-hidden">
            {Array.from({ length: 50 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 bg-white rounded-full"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                }}
                animate={{
                  opacity: [0.2, 1, 0.2],
                  scale: [1, 1.5, 1],
                }}
                transition={{
                  duration: Math.random() * 2 + 1,
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
            onAnimationComplete={onComplete}
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
            <h2 className="text-4xl font-bold text-white mb-2">🚀 Launching Class!</h2>
            <p className="text-xl text-blue-200">Get ready for an awesome lesson...</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}