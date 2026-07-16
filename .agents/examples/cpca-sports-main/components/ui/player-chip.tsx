import type { Player } from "@/lib/mocks/types";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const playerChipVariants = cva(
  "flex size-[2em] items-center justify-center rounded-full sm:text-[1em] lg:text-[0.75em] font-bold ring-2 ring-zinc-800 shadow-md",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        goalkeeper: "bg-yellow-500 text-black",
        substitute: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface PlayerChipProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof playerChipVariants> {
  player: Player;
  showName?: "last" | "none";
}

export function PlayerChip({
  player,
  variant,
  className,
  showName = "last",
  ...props
}: PlayerChipProps) {
  const nameToShow =
    showName === "last" ? player.name.split(" ").pop() : null;

  return (
    <div
      className={cn("flex flex-col items-center w-full max-w-[4.5em]", className)}
      {...props}
    >
      {/* The Numbered Chip */}
      <div className={cn(playerChipVariants({ variant }))}>
        {player.number}
      </div>

      {/* The Name */}
      {nameToShow && (
        <span
          className={cn(
            "mt-[0.125em] max-w-full truncate text-[0.75em] font-medium text-white",
            "[text-shadow:_1px_1px_2px_rgb(0_0_0_/_70%)]",
          )}
        >
          {nameToShow}
        </span>
      )}
    </div>
  );
}