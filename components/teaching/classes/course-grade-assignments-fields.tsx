"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GradeCheckboxList } from "./grade-checkbox-list";

export type CourseGradeAssignmentInput = {
  gradeCode: string;
  teacherId?: string;
};

export function CourseGradeAssignmentsFields({
  value,
  onChangeAction,
  gradeCode,
  grades,
  teachers,
}: {
  value: CourseGradeAssignmentInput[];
  onChangeAction: (value: CourseGradeAssignmentInput[]) => void;
  gradeCode: string;
  grades: Array<{ code: string; name: string }>;
  teachers?: Array<{ _id: string; fullName: string }>;
}) {
  const t = useTranslations();
  const id = useId();
  const names = new Map(grades.map((grade) => [grade.code, grade.name]));
  return (
    <div className="grid gap-3">
      <div>
        <Label>{t("class.privateGrades")}</Label>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("class.privateGradesDescription")}
        </p>
      </div>
      <GradeCheckboxList
        grades={grades}
        value={value.map((assignment) => assignment.gradeCode)}
        lockedCode={gradeCode}
        onChangeAction={(codes) =>
          onChangeAction(
            codes.map(
              (code) =>
                value.find((assignment) => assignment.gradeCode === code) ?? {
                  gradeCode: code,
                },
            ),
          )
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {value.map((assignment) => (
          <div className="grid gap-2" key={assignment.gradeCode}>
            <Label htmlFor={`${id}-${assignment.gradeCode}`}>
              {t("class.gradeTeacher", {
                grade: names.get(assignment.gradeCode) ?? assignment.gradeCode,
              })}
            </Label>
            <Select
              value={assignment.teacherId ?? "default"}
              onValueChange={(teacherId) =>
                onChangeAction(
                  value.map((item) =>
                    item.gradeCode === assignment.gradeCode
                      ? {
                          gradeCode: item.gradeCode,
                          ...(teacherId === "default" ? {} : { teacherId }),
                        }
                      : item,
                  ),
                )
              }
            >
              <SelectTrigger
                id={`${id}-${assignment.gradeCode}`}
                className="w-full bg-sidebar"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">
                  {t("class.useMainTeacher")}
                </SelectItem>
                {teachers?.map((teacher) => (
                  <SelectItem value={teacher._id} key={teacher._id}>
                    {teacher.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}
