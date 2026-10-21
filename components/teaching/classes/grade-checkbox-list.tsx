"use client";

import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function GradeCheckboxList({
  grades,
  value,
  onChangeAction,
  lockedCode,
}: {
  grades?: Array<{ code: string; name: string }>;
  value: string[];
  onChangeAction: (codes: string[]) => void;
  lockedCode?: string;
}) {
  const id = useId();
  return (
    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
      {grades?.map((grade) => (
        <Label
          key={grade.code}
          htmlFor={`${id}-${grade.code}`}
          className="flex cursor-pointer items-center gap-2 rounded-md border bg-sidebar p-2 font-normal"
        >
          <Checkbox
            id={`${id}-${grade.code}`}
            checked={value.includes(grade.code)}
            disabled={grade.code === lockedCode}
            onCheckedChange={(checked) =>
              onChangeAction(
                checked
                  ? [...new Set([...value, grade.code])]
                  : value.filter((code) => code !== grade.code),
              )
            }
          />
          {grade.name}
        </Label>
      ))}
    </div>
  );
}
