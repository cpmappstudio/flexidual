"use client"

import { motion } from "framer-motion"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useState, useEffect, RefObject, useCallback } from "react"
import { useTheme } from "next-themes"

interface ScrollIndicatorProps {
  containerRef: RefObject<HTMLDivElement | null>
}

export function ScrollIndicator({ containerRef }: ScrollIndicatorProps) {
  const [canScrollDown, setCanScrollDown] = useState(false)
  const [canScrollUp, setCanScrollUp] = useState(false)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const checkScroll = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const { scrollTop, scrollHeight, clientHeight } = container
    
    // Check if can scroll down (not at bottom)
    setCanScrollDown(scrollHeight - scrollTop - clientHeight > 10)
    
    // Check if can scroll up (not at top)
    setCanScrollUp(scrollTop > 10)
  }, [containerRef])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Initial check
    checkScroll()

    // Add scroll listener
    container.addEventListener('scroll', checkScroll)
    
    // Add resize observer for when content changes
    const resizeObserver = new ResizeObserver(checkScroll)
    resizeObserver.observe(container)

    return () => {
      container.removeEventListener('scroll', checkScroll)
      resizeObserver.disconnect()
    }
  }, [containerRef, checkScroll])

  const gradientDown = isDark
    ? 'linear-gradient(to top, rgba(17, 24, 39, 0.95) 0%, rgba(17, 24, 39, 0) 100%)'
    : 'linear-gradient(to top, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0) 100%)'

  const gradientUp = isDark
    ? 'linear-gradient(to bottom, rgba(17, 24, 39, 0.95) 0%, rgba(17, 24, 39, 0) 100%)'
    : 'linear-gradient(to bottom, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0) 100%)'

  return (
    <>
      {/* Scroll Down Indicator */}
      {canScrollDown && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none z-10"
          style={{ background: gradientDown }}
        >
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
            <motion.div
              animate={{ 
                y: [0, 8, 0],
                opacity: [0.4, 1, 0.4]
              }}
              transition={{ 
                duration: 2, 
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="flex flex-col items-center"
            >
              {/* Glow effect */}
              <motion.div
                className="absolute w-12 h-12 bg-purple-400 dark:bg-purple-500 rounded-full blur-xl opacity-50"
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
              <ChevronDown className="w-6 h-6 text-purple-600 dark:text-purple-400 relative z-10" strokeWidth={3} />
            </motion.div>
          </div>
        </motion.div>
      )}

      {/* Scroll Up Indicator */}
      {canScrollUp && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="absolute top-0 left-0 right-0 h-20 pointer-events-none z-10"
          style={{ background: gradientUp }}
        >
          <div className="absolute top-2 left-1/2 -translate-x-1/2">
            <motion.div
              animate={{ 
                y: [0, -8, 0],
                opacity: [0.4, 1, 0.4]
              }}
              transition={{ 
                duration: 2, 
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="flex flex-col items-center"
            >
              {/* Glow effect */}
              <motion.div
                className="absolute w-12 h-12 bg-purple-400 dark:bg-purple-500 rounded-full blur-xl opacity-50"
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
              <ChevronUp className="w-6 h-6 text-purple-600 dark:text-purple-400 relative z-10" strokeWidth={3} />
            </motion.div>
          </div>
        </motion.div>
      )}
    </>
  )
}