"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ROUTES } from "@/lib/navigation/routes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_PROGRAM_ICON_KEY } from "@/lib/programs/icon-keys";
import { ProgramIconPicker } from "@/components/sections/shell/programs/create/program-icon-picker";

interface ProgramCreateDialogProps {
  organizationId: Id<"organizations">;
  organizationSlug: string;
  children: ReactNode;
}

export function ProgramCreateDialog({
  organizationId,
  organizationSlug,
  children,
}: ProgramCreateDialogProps) {
  const router = useRouter();
  const t = useTranslations("Programs.createDialog");
  const tActions = useTranslations("Common.actions");
  const createDraft = useMutation(api.programs.createDraft);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iconKey, setIconKey] = useState(DEFAULT_PROGRAM_ICON_KEY);
  const [isCreating, setIsCreating] = useState(false);

  const resetForm = () => {
    setName("");
    setDescription("");
    setIconKey(DEFAULT_PROGRAM_ICON_KEY);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!isCreating) {
      setOpen(nextOpen);
      if (!nextOpen) {
        resetForm();
      }
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = name.trim();
    const normalizedDescription = description.trim();

    if (!normalizedName) {
      toast.error(t("feedback.nameRequired"));
      return;
    }

    if (!normalizedDescription) {
      toast.error(t("feedback.descriptionRequired"));
      return;
    }

    setIsCreating(true);

    try {
      const programId = await createDraft({
        organizationId,
        name: normalizedName,
        description: normalizedDescription,
        iconKey,
      });

      toast.success(t("feedback.createSuccess"));
      setOpen(false);
      resetForm();
      router.push(
        `${ROUTES.org.programs.create(organizationSlug)}?programId=${programId}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("feedback.createError");
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="program-create-name">
              {t("fields.name.label")}
            </Label>
            <Input
              id="program-create-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("fields.name.placeholder")}
              disabled={isCreating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="program-create-description">
              {t("fields.description.label")}
            </Label>
            <Textarea
              id="program-create-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("fields.description.placeholder")}
              disabled={isCreating}
              rows={4}
            />
          </div>

          <div className="space-y-3">
            <Label>{t("fields.icon.label")}</Label>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <ProgramIconPicker
                iconKey={iconKey}
                onChange={setIconKey}
                disabled={isCreating}
              />
              <p className="text-sm text-muted-foreground">
                {t("fields.icon.description")}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isCreating}
            >
              {tActions("cancel")}
            </Button>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? tActions("saving") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
