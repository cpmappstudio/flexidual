import Image from "next/image";
import { cn } from "@/lib/utils";

interface FlexidualLogoProps {
  className?: string;
  stacked?: boolean;
  inverted?: boolean;
  priority?: boolean;
  subtitle?: string;
}

export function FlexidualLogo({
  className,
  stacked = false,
  inverted = false,
  priority = false,
  subtitle,
}: FlexidualLogoProps) {
  if (stacked) {
    return (
      <Image
        src="/logo-flexidual.svg"
        alt="Flexidual"
        width={81}
        height={40}
        priority={priority}
        className={cn("h-10 w-auto object-contain", className)}
      />
    );
  }

  return (
    <div
      className={cn("flex h-10 items-center gap-1.5", className)}
      role="img"
      aria-label={subtitle ? `Flexidual — ${subtitle}` : "Flexidual"}
    >
      <Image
        src="/logo-flexidual.svg"
        alt=""
        width={81}
        height={40}
        priority={priority}
        aria-hidden="true"
        className="h-full w-auto object-contain"
      />
      <span className="flex min-w-0 flex-col justify-center">
        <span className="font-logo text-xl font-extrabold leading-none tracking-[0.04em] sm:text-2xl">
          <span
            className={inverted ? "text-primary-foreground" : "text-primary"}
          >
            FLEXI
          </span>
          <span className="text-secondary">DUAL</span>
        </span>
        {subtitle && (
          <span
            className={cn(
              "mt-1 max-w-40 truncate text-[8px] leading-none font-semibold tracking-[0.14em] uppercase sm:max-w-48 sm:text-[9px]",
              inverted ? "text-primary-foreground/75" : "text-muted-foreground",
            )}
          >
            {subtitle}
          </span>
        )}
      </span>
    </div>
  );
}
