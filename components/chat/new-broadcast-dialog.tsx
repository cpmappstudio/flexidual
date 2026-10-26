"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "@/i18n/navigation";
import { useOrgBasePath } from "@/hooks/use-org-base-path";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GradeCheckboxList } from "@/components/teaching/classes/grade-checkbox-list";
import { preventComboboxDialogDismiss } from "@/components/ui/combobox-multiple";
import {
  BroadcastProfessorPicker,
  type BroadcastProfessor,
} from "./broadcast-professor-picker";

export type BroadcastScope = {
  schoolId: Id<"schools">;
  campusId?: Id<"campuses">;
  canInstitution: boolean;
};

export function NewBroadcastDialog({
  scope,
  onClose,
}: {
  scope: BroadcastScope;
  onClose: () => void;
}) {
  const t = useTranslations("classroom.broadcasts");
  const classT = useTranslations("class");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"private" | "school">(
    scope.campusId ? "private" : "school",
  );
  const [campusId, setCampusId] = useState(scope.campusId);
  const [grades, setGrades] = useState<string[]>([]);
  const [teachers, setTeachers] = useState<BroadcastProfessor[]>([]);
  const [saving, setSaving] = useState(false);
  const offeredGrades = useQuery(api.grades.list, { schoolId: scope.schoolId });
  const campuses = useQuery(
    api.campuses.list,
    !scope.campusId && mode === "private"
      ? { schoolId: scope.schoolId, isActive: true }
      : "skip",
  );
  const create = useMutation(api.broadcasts.create);
  const router = useRouter();
  const basePath = useOrgBasePath();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const id = await create({
        name,
        schoolId: scope.schoolId,
        ...(mode === "private" ? { campusId } : {}),
        mode,
        gradeCodes: grades,
        teacherIds: teachers.map((teacher) => teacher._id),
      });
      onClose();
      router.push(`${basePath}/chats/broadcasts/${id}`);
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent
        onEscapeKeyDown={preventComboboxDialogDismiss}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="broadcast-name">{t("name")}</Label>
            <Input
              id="broadcast-name"
              autoFocus
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={saving}
            />
          </div>
          <RadioGroup
            value={mode}
            onValueChange={(value) => {
              setMode(value as "private" | "school");
              setTeachers([]);
            }}
            disabled={saving}
            className="grid grid-cols-2 gap-3"
          >
            <Label className="flex items-center gap-2 rounded-lg border p-3">
              <RadioGroupItem value="private" />
              {classT("privateAccess")}
            </Label>
            <Label className="flex items-center gap-2 rounded-lg border p-3">
              <RadioGroupItem value="school" disabled={!scope.canInstitution} />
              {classT("schoolAccess")}
            </Label>
          </RadioGroup>
          {mode === "private" && !scope.campusId && (
            <div className="grid gap-2">
              <Label>{t("campus")}</Label>
              <Select
                value={campusId}
                onValueChange={(value) => {
                  setCampusId(value as Id<"campuses">);
                  setTeachers([]);
                }}
                disabled={saving}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("campus")} />
                </SelectTrigger>
                <SelectContent>
                  {campuses?.map((campus) => (
                    <SelectItem key={campus._id} value={campus._id}>
                      {campus.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <fieldset disabled={saving} className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">{t("grades")}</legend>
            <GradeCheckboxList
              grades={offeredGrades}
              value={grades}
              onChangeAction={setGrades}
            />
          </fieldset>
          <fieldset disabled={saving} className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">
              {t("professors")}
            </legend>
            <p className="text-sm text-muted-foreground">
              {t("writersDescription")}
            </p>
            <BroadcastProfessorPicker
              key={`${mode}:${campusId ?? "school"}`}
              schoolId={scope.schoolId}
              campusId={campusId}
              mode={mode}
              value={teachers}
              onChange={setTeachers}
              disabled={saving}
            />
          </fieldset>
          <Button
            type="submit"
            disabled={
              saving ||
              !name.trim() ||
              !grades.length ||
              (mode === "private" && !campusId)
            }
          >
            {saving ? t("saving") : t("create")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
