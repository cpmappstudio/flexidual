"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Filter, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { parseConvexError, getErrorMessage } from "@/lib/error-utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PageCreateButton } from "@/components/ui/responsive-page-action";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

interface AddStudentDialogProps {
  classId: Id<"classes">;
}

export function AddStudentDialog({ classId }: AddStudentDialogProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const t = useTranslations();
  const locale = useLocale();
  const debouncedSearch = useDebouncedValue(search);

  const classData = useQuery(
    api.classes.get,
    open ? { id: classId } : "skip",
  );
  const courseGradeCode = classData?.gradeCode;
  const courseGradeName = classData?.gradeName ?? courseGradeCode;

  const searchResults = useQuery(
    api.classes.searchStudents,
    open ? { searchQuery: debouncedSearch, classId } : "skip",
  );

  const addStudent = useMutation(api.classes.addStudent);

  const handleAdd = async (studentId: Id<"users">, name: string) => {
    try {
      await addStudent({ classId, studentId });
      toast.success(t("class.studentAdded", { name }));
    } catch (error) {
      const parsedError = parseConvexError(error);
      if (parsedError) {
        toast.error(getErrorMessage(parsedError, t, locale));
      } else {
        toast.error(t("errors.operationFailed"));
      }
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}
    >
      <DialogTrigger asChild>
        <PageCreateButton label={t("class.enrollStudent")} />
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("class.enrollStudent")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {courseGradeCode && (
            <div className="bg-info/10 p-3 rounded-md flex items-start gap-3 border border-info/30">
              <Filter className="h-4 w-4 text-info mt-1" />
              <div className="text-sm">
                <p className="font-medium text-info">
                  {t("student.filteringByGrade")}
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <Badge
                    variant="secondary"
                    className="bg-card/50 text-xs"
                  >
                    {courseGradeName}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("student.searchPlaceholder")}
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="min-h-[250px] max-h-[400px] overflow-y-auto space-y-2 pr-1">
            {!searchResults ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>{t("student.noResults")}</p>
                {courseGradeCode && (
                  <p className="text-xs mt-1 opacity-70">
                    Try clearing filters or adding students to the platform
                    first.
                  </p>
                )}
              </div>
            ) : (
              searchResults.map((student) => (
                <div
                  key={student._id}
                  className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="size-9 border">
                      <AvatarImage
                        src={student.imageUrl}
                        alt={student.fullName}
                      />
                      <AvatarFallback className="text-xs font-medium">
                        {student.fullName.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="text-sm">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{student.fullName}</p>
                        {student.grade && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-5 px-1.5 text-muted-foreground"
                          >
                            {student.grade === courseGradeCode
                              ? courseGradeName
                              : student.grade}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {student.email}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8"
                    onClick={() => handleAdd(student._id, student.fullName)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    {t("common.add")}
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
