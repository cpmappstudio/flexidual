"use client"

import { motion } from "framer-motion"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useState, useEffect, RefObject, useCallback } from "react"

interface ScrollIndicatorProps {
  containerRef: RefObject<HTMLDivElement | null>
}

export function ScrollIndicator({ containerRef }: ScrollIndicatorProps) {
  const [canScrollDown, setCanScrollDown] = useState(false)
  const [canScrollUp, setCanScrollUp] = useState(false)

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

    // Defer initial check until after browser layout/paint so measurements are valid
    const rafId = requestAnimationFrame(checkScroll)

    container.addEventListener('scroll', checkScroll)

    // Watch for container size changes (viewport resize)
    const resizeObserver = new ResizeObserver(checkScroll)
    resizeObserver.observe(container)

    // Watch for children added/removed (async content → scrollHeight changes)
    const mutationObserver = new MutationObserver(checkScroll)
    mutationObserver.observe(container, { childList: true, subtree: false })

    return () => {
      cancelAnimationFrame(rafId)
      container.removeEventListener('scroll', checkScroll)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [containerRef, checkScroll])

  const gradientDown =
    'linear-gradient(to top, color-mix(in oklch, var(--card) 95%, transparent) 0%, transparent 100%)'
  const gradientUp =
    'linear-gradient(to bottom, color-mix(in oklch, var(--card) 95%, transparent) 0%, transparent 100%)'

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
                className="absolute w-12 h-12 bg-primary rounded-full blur-xl opacity-50"
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
              <ChevronDown className="w-6 h-6 text-primary relative z-10" strokeWidth={3} />
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
                className="absolute w-12 h-12 bg-primary rounded-full blur-xl opacity-50"
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
              <ChevronUp className="w-6 h-6 text-primary relative z-10" strokeWidth={3} />
            </motion.div>
          </div>
        </motion.div>
      )}
    </>
  )
}
