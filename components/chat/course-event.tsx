"use client";

import { ClipboardList } from "lucide-react";
import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { useOrgBasePath } from "@/hooks/use-org-base-path";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "./course-chat-message";

export function CourseEventAvatar({ className }: { className?: string }) {
  return (
    <Avatar
      size="sm"
      className={cn(
        "shrink-0 bg-violet-100 shadow-sm dark:bg-violet-950",
        className,
      )}
    >
      <Image
        src="/astronaut/jump.png"
        alt=""
        width={36}
        height={36}
        sizes="36px"
        className="size-full object-contain p-0.5"
      />
    </Avatar>
  );
}

export function CourseEventContent({
  message,
  preview = false,
}: {
  message: ChatMessage;
  preview?: boolean;
}) {
  const t = useTranslations("classroom.courseEvents");
  const format = useFormatter();
  const basePath = useOrgBasePath();
  const event = message.event;
  if (!event) return null;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm leading-relaxed">
        {t(event.kind === "course_task" ? "taskPublished" : "taskReminder")}
      </p>
      <div className="flex min-w-0 items-start gap-2 rounded-lg border border-violet-200 bg-background/70 p-2.5 dark:border-violet-800">
        <ClipboardList
          className="mt-0.5 size-5 shrink-0 text-violet-600 dark:text-violet-300"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "font-semibold [overflow-wrap:anywhere]",
              preview && "line-clamp-2",
            )}
          >
            {event.title}
          </p>
          {!preview && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {!event.available
                ? t("unavailable")
                : event.dueAt === undefined
                  ? t("noDeadline")
                  : t("deadline", {
                      date: format.dateTime(event.dueAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        ...(event.timeZone ? { timeZone: event.timeZone } : {}),
                      }),
                    })}
            </p>
          )}
        </div>
      </div>
      {!preview && event.available && (
        <Button
          asChild
          variant="outline"
          size="sm"
          className="w-fit max-w-full whitespace-normal border-violet-200 bg-background/70 dark:border-violet-800"
        >
          <Link
            href={`${basePath}/classes/${message.classId}?task=${encodeURIComponent(event.taskId)}`}
          >
            {t("openTask")}
          </Link>
        </Button>
      )}
    </div>
  );
}
