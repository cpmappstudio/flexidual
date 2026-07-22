"use client";

import { Dispatch, ReactNode, SetStateAction, useState } from "react";
import { Doc, Id } from "@/convex/_generated/dataModel";
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
import { UserDialog } from "@/components/admin/users/user-dialog";
import { CurriculumDialog } from "@/components/teaching/curriculums/curriculum-dialog";
import { cn } from "@/lib/utils";
import {
  Calendar,
  Check,
  ChevronsUpDown,
  PlusCircle,
  UserPlus,
} from "lucide-react";
import { useTranslations } from "next-intl";

export interface CourseFormData {
  name: string;
  description: string;
  academicYear: string;
  curriculumId: string;
  teacherId: string;
  gradeCode: string;
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
  showAcademicYear?: boolean;
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
  showAcademicYear = true,
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
  const selectedCurriculum = curriculums?.find(
    (curriculum) => curriculum._id === formData.curriculumId,
  );
  const availableGrades = selectedCurriculum?.gradeCodes?.length
    ? grades?.filter((grade) =>
        selectedCurriculum.gradeCodes?.includes(grade.code),
      )
    : grades;
  const gradeNames = new Map(grades?.map((grade) => [grade.code, grade.name]));

  return (
    <div className="grid gap-4 py-2">
      <div className={cn("grid gap-4", primaryFieldsClassName)}>
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
                  className="flex-1 justify-between overflow-hidden bg-sidebar text-left font-normal"
                >
                  <span className="truncate">
                    {formData.curriculumId
                      ? curriculums?.find(
                          (curriculum) =>
                            curriculum._id === formData.curriculumId,
                        )?.title
                      : t("class.selectCurriculum")}
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
                      {curriculums
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
                                gradeCode:
                                  !curriculum.gradeCodes?.length ||
                                  curriculum.gradeCodes.includes(
                                    current.gradeCode,
                                  )
                                    ? current.gradeCode
                                    : "",
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

            {!curriculumEmptyState && (
              <CurriculumDialog
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title={t("curriculum.createCurriculum")}
                    className="shrink-0 bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80"
                  >
                    <PlusCircle className="h-4 w-4" />
                  </Button>
                }
              />
            )}
          </div>
          {curriculums?.length === 0 && curriculumEmptyState}
        </div>

        <div className="grid gap-2">
          <Label>
            {t("class.grade")} <span className="text-destructive">*</span>
          </Label>
          <Select
            value={formData.gradeCode}
            onValueChange={(gradeCode) =>
              setFormData((current) => ({ ...current, gradeCode }))
            }
          >
            <SelectTrigger className="w-full bg-sidebar">
              <SelectValue placeholder={t("class.selectGrade")} />
            </SelectTrigger>
            <SelectContent>
              {availableGrades?.map((grade) => (
                <SelectItem key={grade._id} value={grade.code}>
                  {grade.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {grades?.length === 0 && gradeEmptyState}
        </div>

        {academicPeriodField}

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

              {!teacherEmptyState && (
                <UserDialog
                  defaultRole="teacher"
                  allowedRoles={["teacher"]}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title={t("teacher.new")}
                      className="shrink-0 bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80"
                    >
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  }
                />
              )}
            </div>
            {teachers?.length === 0 && teacherEmptyState}
          </div>
        )}
      </div>

      <div
        className={cn(
          "grid grid-cols-1 items-start gap-4",
          showAcademicYear && "sm:grid-cols-2",
        )}
      >
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

        {showAcademicYear && (
          <div className="flex flex-col gap-2 sm:mt-0.5">
            <Label>{t("class.academicYear")}</Label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={formData.academicYear}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    academicYear: event.target.value,
                  }))
                }
                placeholder={t("classDialog.placeholders.academicYear")}
              />
            </div>
          </div>
        )}
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
