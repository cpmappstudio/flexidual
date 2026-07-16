"use client";

import { getProgramIcon } from "@/lib/programs/icon-catalog";
import { cn } from "@/lib/utils";

interface ProgramIconAvatarProps {
  iconKey?: string | null;
  className?: string;
  iconClassName?: string;
}

export function ProgramIconAvatar({
  iconKey,
  className,
  iconClassName,
}: ProgramIconAvatarProps) {
  const Icon = getProgramIcon(iconKey);

  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-primary via-primary/85 to-primary/65 text-primary-foreground/70",
        className,
      )}
    >
      <Icon className={cn("size-10", iconClassName)} />
    </div>
  );
}
