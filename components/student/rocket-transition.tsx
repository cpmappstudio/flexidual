"use client";

import { memo, useMemo } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";

interface RocketLaunchButtonContentProps {
  label: string;
  isLaunching: boolean;
  onComplete: () => void;
}

export const RocketLaunchButtonContent = memo(
  function RocketLaunchButtonContent({
    label,
    isLaunching,
    onComplete,
  }: RocketLaunchButtonContentProps) {
    const shouldReduceMotion = Boolean(useReducedMotion());
    const characters = useMemo(() => Array.from(label), [label]);

    return (
      <>
        <span
          aria-hidden="true"
          className="invisible inline-flex items-center gap-2 whitespace-nowrap"
        >
          <span className="h-5 w-[1.375rem] shrink-0" />
          <span>{label}</span>
        </span>

        {isLaunching ? (
          shouldReduceMotion ? (
            <motion.span
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.08 }}
              onAnimationComplete={onComplete}
              className="absolute inset-0 flex items-center justify-center"
            >
              {label}
            </motion.span>
          ) : (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="relative inline-flex items-center gap-2 whitespace-nowrap">
                <span className="h-5 w-5 shrink-0" />
                <span aria-label={label}>
                  {characters.map((character, index) => (
                    <motion.span
                      key={`${character}-${index}`}
                      aria-hidden="true"
                      initial={{ opacity: 1, scale: 1, y: 0 }}
                      animate={{ opacity: 0, scale: 0.78, y: -2 }}
                      transition={{
                        duration: 0.1,
                        delay:
                          0.08 +
                          index * (0.22 / Math.max(characters.length - 1, 1)),
                        ease: "easeOut",
                      }}
                      className="inline-block"
                    >
                      {character === " " ? "\u00A0" : character}
                    </motion.span>
                  ))}
                </span>
                <motion.span
                  initial={{ x: "0%" }}
                  animate={{ x: "112%" }}
                  transition={{
                    duration: 0.4,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  onAnimationComplete={onComplete}
                  className="pointer-events-none absolute inset-0 flex items-center"
                >
                  <motion.span
                    initial={{ rotate: -4, scale: 0.9 }}
                    animate={{ rotate: 4, scale: 1.04 }}
                    transition={{
                      duration: 0.4,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <Image
                      src="/rocket.svg"
                      alt=""
                      width={20}
                      height={18}
                      aria-hidden="true"
                      className="h-5 w-auto drop-shadow-sm"
                    />
                  </motion.span>
                </motion.span>
              </span>
            </span>
          )
        ) : (
          <span className="absolute inset-0 inline-flex items-center justify-center gap-2 whitespace-nowrap">
            <Image
              src="/rocket.svg"
              alt=""
              width={20}
              height={18}
              aria-hidden="true"
              className="h-5 w-auto transition-transform duration-200 motion-safe:group-hover:-translate-y-1 motion-safe:group-hover:rotate-6 motion-reduce:transition-none"
            />
            <span>{label}</span>
          </span>
        )}
      </>
    );
  },
);
