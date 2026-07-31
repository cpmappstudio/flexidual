"use client";

import { memo, useMemo } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";

const STARS = Array.from({ length: 24 }, (_, index) => ({
  id: index,
  left: `${(index * 17.3) % 100}%`,
  top: `${(index * 23.7) % 100}%`,
  delay: (index % 8) * 0.12,
  duration: 1.4 + (index % 4) * 0.25,
  size: index % 5 === 0 ? 5 : index % 3 === 0 ? 3 : 2,
}));

const SPEED_LINES = Array.from({ length: 9 }, (_, index) => ({
  id: index,
  left: `${8 + ((index * 13.7) % 84)}%`,
  top: `${(index * 19.1) % 75}%`,
  delay: (index % 5) * 0.1,
  height: 28 + (index % 3) * 18,
}));

type RocketPhase = "launch" | "loading";

function RocketStarfield({
  phase,
  shouldReduceMotion,
}: {
  phase: RocketPhase;
  shouldReduceMotion: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {STARS.map((star) => (
        <motion.span
          key={star.id}
          className="absolute rounded-full bg-inverse-foreground/80"
          style={{
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
          }}
          animate={
            shouldReduceMotion
              ? undefined
              : {
                  y: phase === "launch" ? [0, 90] : [0, 22],
                  opacity:
                    phase === "launch" ? [0.15, 0.9, 0.15] : [0.25, 0.75, 0.25],
                }
          }
          transition={{
            duration: phase === "launch" ? star.duration * 0.55 : star.duration,
            delay: star.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
      {phase === "launch" &&
        SPEED_LINES.map((line) => (
          <motion.span
            key={line.id}
            className="absolute w-px rounded-full bg-gradient-to-b from-transparent via-inverse-foreground/50 to-transparent"
            style={{
              left: line.left,
              top: line.top,
              height: line.height,
            }}
            initial={{ opacity: 0, y: -24 }}
            animate={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: [0, 0.75, 0], y: [-24, 150] }
            }
            transition={{
              duration: 0.75,
              delay: line.delay,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        ))}
    </div>
  );
}

function RocketVisual({
  phase,
  shouldReduceMotion,
  onLaunchComplete,
}: {
  phase: RocketPhase;
  shouldReduceMotion: boolean;
  onLaunchComplete?: () => void;
}) {
  return (
    <motion.div
      initial={
        phase === "launch" && !shouldReduceMotion
          ? { y: 56, rotate: -5, scale: 0.78 }
          : false
      }
      animate={
        shouldReduceMotion
          ? { y: 0, rotate: 0, scale: 1 }
          : phase === "launch"
            ? {
                y: [56, -10, 0],
                rotate: [-5, 2, 0],
                scale: [0.78, 1.04, 1],
              }
            : {
                rotate: [-1.5, 1.5, -1.5],
              }
      }
      transition={
        phase === "launch"
          ? {
              duration: shouldReduceMotion ? 0.1 : 1.2,
              times: [0, 0.72, 1],
              ease: [0.22, 1, 0.36, 1],
            }
          : {
              duration: 2.8,
              repeat: Infinity,
              ease: "easeInOut",
            }
      }
      onAnimationComplete={phase === "launch" ? onLaunchComplete : undefined}
      className="relative"
    >
      <div
        aria-hidden="true"
        className="absolute inset-2 rounded-full bg-warning/50 blur-3xl motion-safe:animate-pulsing motion-safe:animate-iteration-count-infinite motion-safe:animate-duration-1000"
      />
      {phase === "launch" && (
        <>
          <span
            aria-hidden="true"
            className="absolute inset-5 rounded-full border border-warning/50 motion-safe:animate-ping"
          />
          <span
            aria-hidden="true"
            className="absolute inset-8 rounded-full border border-inverse-foreground/30 motion-safe:animate-ping motion-safe:[animation-delay:300ms]"
          />
        </>
      )}
      <div className="relative motion-safe:animate-float motion-safe:animate-iteration-count-infinite">
        <Image
          src="/rocket.svg"
          alt=""
          width={188}
          height={160}
          priority
          className="h-auto w-36 drop-shadow-2xl sm:w-44"
        />
      </div>
    </motion.div>
  );
}

function RocketScene({
  label,
  supportingText,
  phase,
  onLaunchComplete,
}: {
  label: string;
  supportingText?: string;
  phase: RocketPhase;
  onLaunchComplete?: () => void;
}) {
  const shouldReduceMotion = Boolean(useReducedMotion());

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-inverse via-primary to-info px-6 text-center">
      <RocketStarfield phase={phase} shouldReduceMotion={shouldReduceMotion} />
      <motion.div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-warning/15 blur-3xl"
        animate={
          shouldReduceMotion
            ? undefined
            : { scale: [0.9, 1.15, 0.9], opacity: [0.35, 0.7, 0.35] }
        }
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative z-10 flex flex-col items-center">
        <RocketVisual
          phase={phase}
          shouldReduceMotion={shouldReduceMotion}
          onLaunchComplete={onLaunchComplete}
        />
        <motion.div
          initial={phase === "launch" ? { opacity: 0, y: 12 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: phase === "launch" ? 0.2 : 0, duration: 0.35 }}
        >
          <p className="mt-5 text-xl font-bold text-inverse-foreground sm:text-2xl">
            {label}
          </p>
          {supportingText && (
            <p className="mt-1 max-w-sm text-sm font-medium text-inverse-foreground/75 sm:text-base">
              {supportingText}
            </p>
          )}
          {phase === "loading" && (
            <div
              aria-hidden="true"
              className="mt-3 flex items-center justify-center gap-1.5"
            >
              {[0, 1, 2].map((index) => (
                <motion.span
                  key={index}
                  className="size-1.5 rounded-full bg-warning"
                  animate={
                    shouldReduceMotion
                      ? undefined
                      : { opacity: [0.35, 1, 0.35], y: [0, -3, 0] }
                  }
                  transition={{
                    duration: 0.9,
                    delay: index * 0.15,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

interface RocketTransitionProps {
  onComplete: () => void;
}

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

export function RocketTransition({ onComplete }: RocketTransitionProps) {
  const t = useTranslations("student");
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      key="launching"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: shouldReduceMotion ? 0.1 : 0.25 }}
      className="absolute inset-0 z-50"
    >
      <div className="h-full w-full">
        <RocketScene
          label={t("launchingClass")}
          supportingText={t("getReady")}
          phase="launch"
          onLaunchComplete={onComplete}
        />
      </div>
    </motion.div>
  );
}

export function ClassroomRocketLoader({ label }: { label: string }) {
  return <RocketScene label={label} phase="loading" />;
}
