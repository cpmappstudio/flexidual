"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type TeacherOption = {
  _id: Id<"users">;
  fullName: string;
  email?: string;
  role?: string;
};

export function TeacherAssignmentPicker({
  teachers,
  value,
  onValueChange,
  multiple = false,
  placeholder,
  labelId,
  fallbackName,
  contentClassName,
}: {
  teachers?: TeacherOption[];
  value: string[];
  onValueChange: (ids: string[]) => void;
  multiple?: boolean;
  placeholder: string;
  labelId?: string;
  fallbackName?: string;
  contentClassName?: string;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const selectedTeacher = teachers?.find((teacher) => teacher._id === value[0]);
  const selectedNames = teachers
    ?.filter((teacher) => value.includes(teacher._id))
    .map((teacher) => teacher.fullName)
    .join(", ");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-labelledby={labelId}
          aria-expanded={open}
          className="w-full justify-between overflow-hidden bg-sidebar text-left font-normal"
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate">
              {selectedNames || fallbackName || placeholder}
            </span>
            {!multiple &&
              (selectedTeacher?.role === "teacher" ||
                selectedTeacher?.role === "principal") && (
                <Badge variant="role">
                  {t(
                    selectedTeacher.role === "principal"
                      ? "class.principalRole"
                      : "class.teacherRole",
                  )}
                </Badge>
              )}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0",
          contentClassName,
        )}
        align="start"
      >
        <Command>
          <CommandInput
            placeholder={t("classDialog.placeholders.searchTeacher")}
          />
          <CommandList>
            <CommandEmpty>{t("class.noAssignableTeachers")}</CommandEmpty>
            <CommandGroup>
              {teachers
                ?.slice()
                .sort((a, b) => a.fullName.localeCompare(b.fullName))
                .map((teacher) => (
                  <CommandItem
                    key={teacher._id}
                    value={`${teacher.fullName} ${teacher.email ?? ""} ${teacher._id}`}
                    onSelect={() => {
                      onValueChange(
                        multiple
                          ? value.includes(teacher._id)
                            ? value.filter((id) => id !== teacher._id)
                            : [...value, teacher._id]
                          : [teacher._id],
                      );
                      if (!multiple) setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        value.includes(teacher._id)
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">
                        {teacher.fullName}
                      </span>
                      {teacher.email && (
                        <span className="truncate text-[10px] text-muted-foreground">
                          {teacher.email}
                        </span>
                      )}
                    </span>
                    {(teacher.role === "teacher" ||
                      teacher.role === "principal") && (
                      <Badge variant="role">
                        {t(
                          teacher.role === "principal"
                            ? "class.principalRole"
                            : "class.teacherRole",
                        )}
                      </Badge>
                    )}
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
