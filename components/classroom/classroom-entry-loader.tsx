"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { ClassroomEntryRocket } from "./classroom-entry-rocket";

const ENTRY_DURATION_SECONDS = 3;
const BRAND_LETTERS = Array.from("FLEXIDUAL");
const STARS = Array.from({ length: 12 }, (_, index) => ({
  left: `${(index * 17.3 + 9) % 100}%`,
  top: `${(index * 23.7 + 17) % 100}%`,
}));
const PLANET_POSITION = { x: -22, y: 0, scale: 0.86, opacity: 1 };
const PLANET_ARRIVAL = {
  x: [0, 0, 0, -22],
  y: [-24, 0, 0, 0],
  scale: [0.82, 1, 1, 0.86],
  opacity: [0, 1, 1, 1],
};

export function ClassroomEntryLoader({
  label,
  onComplete,
}: {
  label: string;
  onComplete: () => void;
}) {
  const shouldReduceMotion = Boolean(useReducedMotion());

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col items-center justify-center gap-3 overflow-hidden bg-[color-mix(in_srgb,var(--primary)_25%,var(--inverse))] px-3 py-4 text-center text-inverse-foreground [container-type:size]">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {STARS.map((position, index) => (
          <span
            key={index}
            className={`absolute rounded-full bg-inverse-foreground/55 ${index % 4 === 0 ? "size-1" : "size-0.5"}`}
            style={position}
          />
        ))}
      </div>
      <div
        className="relative h-60 w-full max-w-lg shrink-0 [@container(240px<height<=360px)]:h-36 [@container(max-height:240px)]:h-20"
        aria-hidden="true"
      >
        <div className="absolute inset-x-0 top-0 h-60 origin-top [@container(240px<height<=360px)]:scale-60 [@container(max-height:240px)]:scale-[0.3333]">
          <motion.div
            className="absolute left-1/2 top-[10.5px] h-[207px] w-[236px] -ml-[118px] motion-reduce:opacity-100!"
            initial={
              shouldReduceMotion
                ? false
                : { x: 0, y: -24, scale: 0.82, opacity: 0 }
            }
            animate={shouldReduceMotion ? PLANET_POSITION : PLANET_ARRIVAL}
            transition={{
              duration: shouldReduceMotion ? 0 : ENTRY_DURATION_SECONDS,
              times: [0, 0.16, 0.68, 1],
              ease: "easeOut",
            }}
            onAnimationComplete={onComplete}
          >
            <Image
              src="/flexidual-planet.svg"
              alt=""
              width={236}
              height={207}
              priority
              className="h-full w-full object-contain"
            />
          </motion.div>
          {!shouldReduceMotion && (
            <ClassroomEntryRocket duration={ENTRY_DURATION_SECONDS * 0.82} />
          )}
          <div
            className="absolute left-1/2 top-6 -ml-[5px] size-28 motion-safe:animate-fade-in-up motion-safe:animate-duration-700"
            style={{ animationDelay: `${ENTRY_DURATION_SECONDS * 0.72}s` }}
          >
            <Image
              src="/astronaut/takeoffdiagonal.svg"
              alt=""
              width={112}
              height={112}
              priority
              className="size-full -rotate-[8deg] object-contain"
            />
          </div>
        </div>
      </div>
      <div
        className="relative flex font-logo text-3xl font-extrabold tracking-[0.04em] sm:text-5xl [@container(max-height:360px)]:text-3xl"
        role="img"
        aria-label="Flexidual"
      >
        {BRAND_LETTERS.map((letter, index) => (
          <span
            key={index}
            aria-hidden="true"
            className={`inline-block motion-safe:animate-fade-in-up motion-safe:animate-duration-300 ${index >= 5 ? "text-secondary" : "text-inverse-foreground"}`}
            style={{
              animationDelay: `${ENTRY_DURATION_SECONDS * 0.82 + index * 0.03}s`,
            }}
          >
            {letter}
          </span>
        ))}
      </div>
      <p
        role="status"
        className="relative max-w-sm text-sm font-semibold text-inverse-foreground/85 sm:text-base"
      >
        {label}
      </p>
    </div>
  );
}
