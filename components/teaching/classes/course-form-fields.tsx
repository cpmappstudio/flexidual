"use client";

import { Dispatch, ReactNode, SetStateAction, useState } from "react";
import { Doc, Id } from "@/convex/_generated/dataModel";
import type { LiveAccess } from "@/convex/model/liveAccess";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Textarea } from "@/components/ui/textarea";
import { isCurriculumAvailableForGrade } from "@/lib/curriculum";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { CourseLiveAccessFields } from "./course-live-access-fields";

export interface CourseFormData {
  name: string;
  description: string;
  curriculumId: string;
  teacherId: string;
  gradeCode: string;
  liveAccess: LiveAccess;
}

interface TeacherOption {
  _id: Id<"users">;
  fullName: string;
  email?: string;
}

interface CourseFormFieldsProps {
  formData: CourseFormData;
  setFormDataAction: Dispatch<SetStateAction<CourseFormData>>;
  curriculums?: Doc<"curriculums">[] | null;
  teachers?: TeacherOption[];
  grades?: Doc<"institutionGrades">[];
  isAdmin: boolean;
  nameRequired?: boolean;
  academicPeriodField?: ReactNode;
  curriculumEmptyState?: ReactNode;
  teacherEmptyState?: ReactNode;
  gradeEmptyState?: ReactNode;
  onNameChangeAction?: (name: string) => void;
  primaryFieldsClassName?: string;
}

export function CourseFormFields({
  formData,
  setFormDataAction: setFormData,
  curriculums,
  teachers,
  grades,
  isAdmin,
  nameRequired = false,
  academicPeriodField,
  curriculumEmptyState,
  teacherEmptyState,
  gradeEmptyState,
  onNameChangeAction,
  primaryFieldsClassName,
}: CourseFormFieldsProps) {
  const t = useTranslations();
  const [openCurriculum, setOpenCurriculum] = useState(false);
  const [openTeacher, setOpenTeacher] = useState(false);
  const availableCurriculums = formData.gradeCode
    ? curriculums?.filter((curriculum) =>
        isCurriculumAvailableForGrade(
          curriculum.gradeCodes,
          formData.gradeCode,
        ),
      )
    : [];
  const gradeNames = new Map(grades?.map((grade) => [grade.code, grade.name]));

  return (
    <div className="grid gap-4 py-2">
      <div className={cn("grid gap-4", primaryFieldsClassName)}>
        <div className="grid gap-2">
          <Label>
            {t("class.grade")} <span className="text-destructive">*</span>
          </Label>
          <Select
            value={formData.gradeCode}
            onValueChange={(gradeCode) =>
              setFormData((current) => {
                const curriculum = curriculums?.find(
                  (item) => item._id === current.curriculumId,
                );
                const curriculumMatchesGrade =
                  !current.curriculumId ||
                  Boolean(
                    curriculum &&
                      isCurriculumAvailableForGrade(
                        curriculum.gradeCodes,
                        gradeCode,
                      ),
                  );
                const selectedAccessGrades =
                  current.liveAccess.allowedGradeCodes;
                const allowedGradeCodes =
                  current.liveAccess.mode === "school" &&
                  (selectedAccessGrades.length === 0 ||
                    (selectedAccessGrades.length === 1 &&
                      selectedAccessGrades[0] === current.gradeCode))
                    ? [gradeCode]
                    : selectedAccessGrades;

                return {
                  ...current,
                  gradeCode,
                  liveAccess: {
                    ...current.liveAccess,
                    allowedGradeCodes,
                  },
                  curriculumId: curriculumMatchesGrade
                    ? current.curriculumId
                    : "",
                };
              })
            }
          >
            <SelectTrigger className="w-full bg-sidebar">
              <SelectValue placeholder={t("class.selectGrade")} />
            </SelectTrigger>
            <SelectContent>
              {grades?.map((grade) => (
                <SelectItem key={grade._id} value={grade.code}>
                  {grade.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {grades?.length === 0 && gradeEmptyState}
        </div>

        {academicPeriodField}

        <div className="grid gap-2">
          <Label>
            {t("class.curriculum")} <span className="text-destructive">*</span>
          </Label>
          <div className="flex gap-2">
            <Popover open={openCurriculum} onOpenChange={setOpenCurriculum}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openCurriculum}
                  disabled={!formData.gradeCode}
                  className="flex-1 justify-between overflow-hidden bg-sidebar text-left font-normal"
                >
                  <span className="truncate">
                    {formData.curriculumId
                      ? curriculums?.find(
                          (curriculum) =>
                            curriculum._id === formData.curriculumId,
                        )?.title
                      : formData.gradeCode
                        ? t("class.selectCurriculum")
                        : t("class.selectGradeFirst")}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder={t("classDialog.placeholders.searchCurriculum")}
                  />
                  <CommandList>
                    <CommandEmpty>{t("common.noResults")}</CommandEmpty>
                    <CommandGroup>
                      {availableCurriculums
                        ?.slice()
                        .sort((a, b) => a.title.localeCompare(b.title))
                        .map((curriculum) => (
                          <CommandItem
                            key={curriculum._id}
                            value={`${curriculum.title} ${curriculum.code || ""}`}
                            onSelect={() => {
                              setFormData((current) => ({
                                ...current,
                                curriculumId: curriculum._id,
                              }));
                              setOpenCurriculum(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4 shrink-0",
                                formData.curriculumId === curriculum._id
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <span className="truncate font-medium">
                                {curriculum.title}
                              </span>
                              {(curriculum.code ||
                                curriculum.gradeCodes?.length) && (
                                <span className="ml-auto shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  {[
                                    curriculum.code,
                                    curriculum.gradeCodes?.length
                                      ? curriculum.gradeCodes
                                          .map(
                                            (code) =>
                                              gradeNames.get(code) ?? code,
                                          )
                                          .join(", ")
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" | ")}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          {curriculums?.length === 0 && curriculumEmptyState}
          {formData.gradeCode &&
            curriculums &&
            curriculums.length > 0 &&
            availableCurriculums?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("class.noCurriculumsForGrade")}
              </p>
            )}
        </div>

        {isAdmin && (
          <div className="grid gap-2">
            <Label>
              {t("class.assignTeacher")}{" "}
              <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <Popover open={openTeacher} onOpenChange={setOpenTeacher}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openTeacher}
                    className="flex-1 justify-between overflow-hidden bg-sidebar text-left font-normal"
                  >
                    <span className="truncate">
                      {teachers?.find(
                        (teacher) => teacher._id === formData.teacherId,
                      )?.fullName || t("class.selectTeacher")}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder={t("classDialog.placeholders.searchTeacher")}
                    />
                    <CommandList>
                      <CommandEmpty>{t("teacher.noResults")}</CommandEmpty>
                      <CommandGroup>
                        {teachers
                          ?.slice()
                          .sort((a, b) => a.fullName.localeCompare(b.fullName))
                          .map((teacher) => (
                            <CommandItem
                              key={teacher._id}
                              value={`${teacher.fullName} ${teacher.email || ""}`}
                              onSelect={() => {
                                setFormData((current) => ({
                                  ...current,
                                  teacherId: teacher._id,
                                }));
                                setOpenTeacher(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4 shrink-0",
                                  formData.teacherId === teacher._id
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              <div className="flex min-w-0 flex-col">
                                <span className="truncate font-medium">
                                  {teacher.fullName}
                                </span>
                                {teacher.email && (
                                  <span className="truncate text-[10px] text-muted-foreground">
                                    {teacher.email}
                                  </span>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            {teachers?.length === 0 && teacherEmptyState}
          </div>
        )}
      </div>

      <CourseLiveAccessFields
        value={formData.liveAccess}
        courseGradeCode={formData.gradeCode}
        grades={grades}
        onChangeAction={(liveAccess) =>
          setFormData((current) => ({ ...current, liveAccess }))
        }
      />

      <div className="grid grid-cols-1 items-start gap-4">
        <div className="flex flex-col gap-2">
          <Label className="flex items-center">
            {t("class.name")}
            {nameRequired ? (
              <span className="ml-1 text-destructive">*</span>
            ) : (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({t("common.optional")})
              </span>
            )}
          </Label>
          <Input
            value={formData.name}
            onChange={(event) => {
              const name = event.target.value;
              if (onNameChangeAction) {
                onNameChangeAction(name);
                return;
              }
              setFormData((current) => ({ ...current, name }));
            }}
            placeholder={
              nameRequired
                ? t("class.namePlaceholder")
                : t("classDialog.placeholders.name")
            }
            required={nameRequired}
          />
          {!nameRequired && (
            <p className="text-[10px] leading-tight text-muted-foreground">
              {t("class.autoNamePattern")}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <Label>
          {t("common.description")}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            ({t("common.optional")})
          </span>
        </Label>
        <Textarea
          value={formData.description}
          onChange={(event) =>
            setFormData((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
          placeholder={t("classDialog.placeholders.description")}
          className="h-20 resize-none"
        />
      </div>
    </div>
  );
}
