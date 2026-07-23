import type { ReactNode } from "react";
import { Building03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

type AuthPageShellProps = {
  appName: string;
  children: ReactNode;
  contentClassName?: string;
};

export function AuthPageShell({
  appName,
  children,
  contentClassName,
}: AuthPageShellProps) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div
        className={cn(
          "flex w-full max-w-sm flex-col gap-6",
          contentClassName,
        )}
      >
        <div className="flex items-center gap-2 self-center font-medium">
          <div
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground"
          >
            <HugeiconsIcon icon={Building03Icon} strokeWidth={2} className="size-4" />
          </div>
          <span translate="no">{appName}</span>
        </div>
        {children}
      </div>
    </main>
  );
}
