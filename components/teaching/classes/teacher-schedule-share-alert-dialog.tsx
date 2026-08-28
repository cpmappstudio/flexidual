"use client";

import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type TeacherScheduleShareAlertItem = {
  id: string;
  name: string;
  detail: string;
};

export function TeacherScheduleShareAlertDialog({
  open,
  onOpenChange,
  onConfirm,
  teacherName,
  conflicts,
  isConfirming = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  teacherName: string;
  conflicts: TeacherScheduleShareAlertItem[];
  isConfirming?: boolean;
}) {
  const t = useTranslations();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("class.shareTeacherScheduleTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("class.shareTeacherScheduleDescription", {
              teacher: teacherName,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2 rounded-lg border bg-sidebar p-3">
          {conflicts.map((conflict) => (
            <div key={conflict.id} className="text-sm">
              <p className="font-medium">{conflict.name}</p>
              <p className="text-muted-foreground">{conflict.detail}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {t("class.shareTeacherScheduleScope")}
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isConfirming}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction disabled={isConfirming} onClick={onConfirm}>
            {t("class.shareTeacherScheduleConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
