"use client";

import * as React from "react";
import { ListFilter, X, Check } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface ClassCombinedFilterProps {
  selectedTeacherId: Id<"users"> | null;
  onSelectTeacher: (id: Id<"users"> | null) => void;
  selectedCurriculumId: Id<"curriculums"> | null;
  onSelectCurriculum: (id: Id<"curriculums"> | null) => void;
  isAdmin: boolean;
}

export function ClassCombinedFilter({
  selectedTeacherId,
  onSelectTeacher,
  selectedCurriculumId,
  onSelectCurriculum,
  isAdmin,
}: ClassCombinedFilterProps) {
  const t = useTranslations();

  const teachers = useQuery(api.users.getTeachers);
  const curriculums = useQuery(api.curriculums.list, {
    includeInactive: false,
  });

  const hasActiveFilters = !!(selectedTeacherId || selectedCurriculumId);

  const clearAllFilters = () => {
    onSelectTeacher(null);
    onSelectCurriculum(null);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn(
            "cursor-pointer relative",
            hasActiveFilters && "border-2 border-primary",
          )}
        >
          <ListFilter className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuLabel>{t("table.filters")}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Curriculum filter */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex items-center justify-between">
            <span>{t("navigation.curriculum")}</span>
            {selectedCurriculumId && (
              <Badge color="zinc" className="ml-2 h-5 px-1.5">
                1
              </Badge>
            )}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-[260px] p-0" sideOffset={8}>
            <Command>
              <CommandInput placeholder={t("curriculum.search")} />
              <CommandList className="max-h-[220px]">
                <CommandEmpty>{t("curriculum.noResults")}</CommandEmpty>
                <CommandGroup>
                  {curriculums?.map((curriculum) => (
                    <CommandItem
                      key={curriculum._id}
                      value={`${curriculum.title} ${curriculum.code ?? ""}`}
                      onSelect={() =>
                        onSelectCurriculum(
                          selectedCurriculumId === curriculum._id
                            ? null
                            : curriculum._id,
                        )
                      }
                      className="flex items-center gap-2"
                    >
                      <Check
                        className={cn(
                          "size-4 shrink-0",
                          selectedCurriculumId === curriculum._id
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-sm">
                          {curriculum.title}
                        </p>
                        {curriculum.code && (
                          <p className="text-xs text-muted-foreground truncate">
                            {curriculum.code}
                          </p>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Teacher filter (admin only) */}
        {isAdmin && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="flex items-center justify-between">
              <span>{t("navigation.teacher")}</span>
              {selectedTeacherId && (
                <Badge color="zinc" className="ml-2 h-5 px-1.5">
                  1
                </Badge>
              )}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-[260px] p-0" sideOffset={8}>
              <Command>
                <CommandInput placeholder={t("teacher.search")} />
                <CommandList className="max-h-[220px]">
                  <CommandEmpty>{t("teacher.noResults")}</CommandEmpty>
                  <CommandGroup>
                    {teachers?.map((teacher) => (
                      <CommandItem
                        key={teacher._id}
                        value={`${teacher.fullName}`}
                        onSelect={() =>
                          onSelectTeacher(
                            selectedTeacherId === teacher._id
                              ? null
                              : teacher._id,
                          )
                        }
                        className="flex items-center gap-2"
                      >
                        <Check
                          className={cn(
                            "size-4 shrink-0",
                            selectedTeacherId === teacher._id
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                        <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden shrink-0">
                          {teacher.imageUrl ? (
                            <Image
                              src={teacher.imageUrl}
                              alt={teacher.fullName}
                              width={32}
                              height={32}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-xs font-bold text-white">
                              {teacher.fullName.charAt(0)}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-sm">
                            {teacher.fullName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {teacher.email}
                          </p>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {hasActiveFilters && (
          <>
            <DropdownMenuSeparator />
            <Button
              variant="ghost"
              className="w-full justify-start text-sm font-normal"
              onClick={clearAllFilters}
            >
              <X className="mr-2 h-4 w-4" />
              {t("table.clearFilters")}
            </Button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
