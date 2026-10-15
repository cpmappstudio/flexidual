"use client";

import Image from "next/image";
import { motion } from "framer-motion";

const FLIGHT_TIMES = [0, 0.14, 0.3, 0.42, 0.56, 0.68, 0.8, 0.94, 1];
const FLIGHT = {
  x: ["-65%", "-55%", "65%", "100%", "35%", "-65%", "-55%", "0%", "0%"],
  y: [128, 103, 40, -10, -40, -80, -125, -70, -61],
  rotate: [-12, 28, 38, -28, -62, -16, 92, 135, 135],
  scale: [0.84, 0.92, 1, 0.93, 0.82, 0.71, 0.62, 0.38, 0.18],
  opacity: [0, 1, 1, 1, 1, 1, 1, 1, 0],
};

export function ClassroomEntryRocket({ duration }: { duration: number }) {
  return (
    <div className="absolute left-1/2 top-[137px] -translate-x-1/2 motion-reduce:hidden">
      <motion.div
        className="relative h-[76px] w-[clamp(42px,16cqw,110px)]"
        initial={{ x: "-65%", y: 128, rotate: -12, scale: 0.84, opacity: 0 }}
        animate={FLIGHT}
        transition={{
          duration,
          times: FLIGHT_TIMES,
          ease: [
            "easeIn",
            "easeOut",
            "easeInOut",
            "easeInOut",
            "easeOut",
            "easeInOut",
            "easeIn",
            "easeOut",
          ],
        }}
      >
        <motion.span
          className="absolute left-1/2 top-[61px] h-[88px] w-1.5 -translate-x-1/2 origin-top rounded-full bg-linear-to-b from-secondary/80 via-secondary/30 to-transparent"
          initial={{ opacity: 0.4, scaleY: 0.5 }}
          animate={{
            opacity: [0.4, 0.4, 0.8, 0.5, 0.75, 0.75, 0.4, 0.8, 0],
            scaleY: [0.5, 0.5, 1.15, 0.6, 1, 1, 0.5, 1.1, 0.2],
          }}
          transition={{ duration, times: FLIGHT_TIMES, ease: "easeInOut" }}
        />
        <Image
          src="/rocket.svg"
          alt=""
          width={76}
          height={76}
          priority
          className="absolute left-1/2 top-0 size-[76px] -translate-x-1/2 -rotate-[43deg] object-contain"
        />
      </motion.div>
    </div>
  );
}
