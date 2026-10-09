"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function AstronautEncouragement({
  messages,
  className,
  imageSrc = "/astronaut/reading.png",
}: {
  messages: readonly string[];
  className?: string;
  imageSrc?: string;
}) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    setMessageIndex(Math.floor(Math.random() * messages.length));
  }, [messages.length]);

  return (
    <div
      className={cn(
        "mt-4 border-t border-border/60 pt-4 text-center",
        className,
      )}
    >
      <Image
        src={imageSrc}
        alt=""
        width={48}
        height={48}
        className="mx-auto mb-2 size-12 object-contain"
      />
      <p className="text-balance text-sm leading-relaxed text-muted-foreground">
        {messages[messageIndex]}
      </p>
    </div>
  );
}
