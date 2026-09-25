"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { Doc } from "@/convex/_generated/dataModel";

export function AbekaCourseReport({
  report,
  collapsible = true,
  timeZone,
}: {
  report: Pick<Doc<"abekaProgress">, "subjectName" | "syncedAt"> & {
    lessons: Pick<
      Doc<"abekaProgress">["lessons"][number],
      "lessonNumber" | "percentage" | "completed" | "lastViewed"
    >[];
  };
  collapsible?: boolean;
  timeZone?: string;
}) {
  const t = useTranslations("settings.integrations");
  const format = useFormatter();
  const Container = collapsible ? "details" : "div";
  const Heading = collapsible ? "summary" : "h2";
  return (
    <Container
      className={collapsible ? "rounded-lg border p-3 ph-mask" : "ph-mask"}
    >
      <Heading className={collapsible ? "cursor-pointer" : "pr-6 text-lg"}>
        <span className="font-medium">{report.subjectName}</span>
        <span className="ml-2 text-sm text-muted-foreground">
          {t("completed", {
            count: report.lessons.filter((lesson) => lesson.completed).length,
            total: report.lessons.length,
          })}
        </span>
      </Heading>
      <p className="my-2 text-xs text-muted-foreground">
        {t("lastSync")}:{" "}
        {format.dateTime(report.syncedAt, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone,
        })}
      </p>
      <div className="max-h-64 overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-left">
            <tr>
              <th>{t("lesson")}</th>
              <th>{t("progress")}</th>
              <th>{t("lastViewed")}</th>
            </tr>
          </thead>
          <tbody>
            {report.lessons.map((lesson) => (
              <tr key={lesson.lessonNumber} className="border-t">
                <td className="py-2">{lesson.lessonNumber}</td>
                <td>
                  {lesson.percentage}% {lesson.completed ? "✓" : ""}
                </td>
                <td>{lesson.lastViewed ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Container>
  );
}
