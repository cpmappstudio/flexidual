"use client";

import type { ReactNode } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import { CourseQuizInstructions } from "./course-quiz-definition";
import { CourseTaskHeader } from "./course-task-header";
import { CourseTaskSummary } from "./course-task-summary";
import { CourseQuizStudent } from "./course-quiz-student";

export function CourseQuizDetail({
  task,
  canManage,
  submissionsOpen,
  timeZone,
  onEdit,
  onDelete,
  children,
}: {
  task: Doc<"courseTasks">;
  canManage: boolean;
  submissionsOpen: boolean;
  timeZone: string;
  onEdit: () => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-5 py-2 has-[[data-quiz-active=true]]:mx-auto has-[[data-quiz-active=true]]:max-w-4xl has-[[data-quiz-active=true]]:[&>[data-quiz-overview]]:hidden">
      <div data-quiz-overview>
        <CourseTaskHeader
          task={task}
          canManage={canManage}
          submissionsOpen={submissionsOpen}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
      {canManage ? (
        <>
          <CourseTaskSummary task={task} timeZone={timeZone} canManage />
          {children}
          <CourseQuizInstructions description={task.description} collapsible />
        </>
      ) : (
        <CourseQuizStudent task={task} timeZone={timeZone} />
      )}
    </div>
  );
}
