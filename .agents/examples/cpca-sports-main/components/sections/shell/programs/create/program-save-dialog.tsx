"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ProgramSaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programName: string;
  canSaveProgram: boolean;
  isSaving: boolean;
  onConfirm: (values: {
    saveProgram: boolean;
    saveTemplate: boolean;
    templateName: string;
  }) => void | Promise<void>;
}

function getSuggestedTemplateName(programName: string, suffix: string) {
  const name = programName.trim();
  return name ? `${name} (${suffix})` : "";
}

export function ProgramSaveDialog({
  open,
  onOpenChange,
  programName,
  canSaveProgram,
  isSaving,
  onConfirm,
}: ProgramSaveDialogProps) {
  const t = useTranslations("Programs.create.saveDialog");
  const tActions = useTranslations("Common.actions");
  const suggestedSuffix = t("fields.templateNameSuggestedSuffix");
  const [saveProgram, setSaveProgram] = useState(canSaveProgram);
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState(
    getSuggestedTemplateName(programName, suggestedSuffix),
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setSaveProgram(canSaveProgram);
    setSaveTemplate(false);
    setTemplateName(getSuggestedTemplateName(programName, suggestedSuffix));
  }, [canSaveProgram, open, programName, suggestedSuffix]);

  const canSubmit =
    (saveProgram || saveTemplate) &&
    (!saveTemplate || templateName.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                id="save-program-target"
                checked={saveProgram}
                disabled={!canSaveProgram || isSaving}
                onCheckedChange={(checked) => setSaveProgram(checked === true)}
              />
              <div className="space-y-1">
                <Label htmlFor="save-program-target">
                  {t("targets.program")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {canSaveProgram
                    ? t("targets.programDescription")
                    : t("targets.programAlreadySaved")}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                id="save-template-target"
                checked={saveTemplate}
                disabled={isSaving}
                onCheckedChange={(checked) => setSaveTemplate(checked === true)}
              />
              <div className="space-y-1">
                <Label htmlFor="save-template-target">
                  {t("targets.template")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t("targets.templateDescription")}
                </p>
              </div>
            </div>
          </div>

          {saveTemplate ? (
            <div className="space-y-2">
              <Label htmlFor="template-name">{t("fields.templateName")}</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder={getSuggestedTemplateName(
                  programName,
                  suggestedSuffix,
                )}
                disabled={isSaving}
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            {tActions("cancel")}
          </Button>
          <Button
            type="button"
            onClick={() =>
              void onConfirm({
                saveProgram,
                saveTemplate,
                templateName: templateName.trim(),
              })
            }
            disabled={!canSubmit || isSaving}
          >
            {isSaving ? tActions("saving") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
