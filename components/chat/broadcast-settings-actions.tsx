"use client";

import { useId, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { LoaderCircle, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useOrgBasePath } from "@/hooks/use-org-base-path";
import { useRouter } from "@/i18n/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function BroadcastNameSetting({
  broadcastId,
}: {
  broadcastId: Id<"broadcasts">;
}) {
  const t = useTranslations("classroom.broadcasts");
  const commonT = useTranslations("common");
  // Shares the existing context subscription; no separate directory/name query.
  const context = useQuery(api.broadcasts.context, { broadcastId });
  const rename = useMutation(api.broadcasts.rename);
  const id = useId();
  const [draft, setDraft] = useState<string>();
  const [saving, setSaving] = useState(false);
  if (!context?.canManage || context.archived) return null;
  const name = draft ?? context.name;
  return (
    <form
      className="grid gap-2 py-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving || !name.trim() || name.trim() === context.name) return;
        setSaving(true);
        try {
          await rename({ broadcastId, name });
          setDraft(undefined);
          toast.success(t("renamed"));
        } catch {
          toast.error(t("renameError"));
        } finally {
          setSaving(false);
        }
      }}
    >
      <Label htmlFor={id}>{t("name")}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          className="min-w-0 flex-1"
          value={name}
          maxLength={120}
          required
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          size="icon"
          aria-label={commonT("save")}
          title={commonT("save")}
          disabled={saving || !name.trim() || name.trim() === context.name}
        >
          {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
        </Button>
      </div>
    </form>
  );
}

export function DeleteBroadcastAction({
  broadcastId,
}: {
  broadcastId: Id<"broadcasts">;
}) {
  const t = useTranslations("classroom.broadcasts");
  const commonT = useTranslations("common");
  const remove = useMutation(api.broadcasts.remove);
  const router = useRouter();
  const basePath = useOrgBasePath();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  async function confirm() {
    if (deleting) return;
    setDeleting(true);
    try {
      await remove({ broadcastId });
      toast.success(t("deleted"));
      router.replace(basePath);
    } catch {
      toast.error(t("deleteError"));
      setDeleting(false);
    }
  }
  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (!deleting) setOpen(value);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-auto w-full justify-start gap-3 px-0 py-4 text-destructive hover:bg-transparent hover:text-destructive/80"
        >
          <Trash2 className="size-4" />
          <span className="text-sm font-medium">{t("delete")}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteConfirmation")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>
            {commonT("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            className={buttonVariants({ variant: "destructive" })}
            onClick={(event) => {
              event.preventDefault();
              void confirm();
            }}
          >
            {deleting && <LoaderCircle className="animate-spin" />}
            {t("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
