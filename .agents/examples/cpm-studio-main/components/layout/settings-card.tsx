import type { ReactNode } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SettingsCard({
  action,
  title,
  children,
  className,
  contentClassName,
}: {
  action?: ReactNode;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("min-w-0 max-w-full rounded-3xl", className)}>
      {title || action ? (
        <CardHeader className="px-5">
          {title ? (
            <CardTitle className="text-base font-semibold tracking-tight">
              {title}
            </CardTitle>
          ) : null}
          {action ? <CardAction>{action}</CardAction> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn("min-w-0 px-5", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
