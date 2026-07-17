"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { cn } from "@/lib/utils";
import {
  type DocumentTypeVisibility,
  type EditDocumentTypeInput,
  type ErrorHandler,
  handleDocumentTypeError,
} from "./document-type-shared";

interface DocumentTypeCardProps {
  name: string;
  description?: string;
  visibility: DocumentTypeVisibility;
  statusBadge?: ReactNode;
  className?: string;
  children?: ReactNode;
  canEdit?: boolean;
  canDelete?: boolean;
  onSaveEdit?: (values: EditDocumentTypeInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  onVisibilityChange?: (visibility: DocumentTypeVisibility) => Promise<void>;
  onError?: ErrorHandler;
}

function VisibilityBadge({
  visibility,
  onVisibilityChange,
  onError,
}: {
  visibility: DocumentTypeVisibility;
  onVisibilityChange?: (visibility: DocumentTypeVisibility) => Promise<void>;
  onError?: ErrorHandler;
}) {
  const t = useTranslations("Applications.documents");
  const { isAdmin } = useIsAdmin();
  const [isOpen, setIsOpen] = useState(false);

  const handleVisibilityChange = async (
    nextVisibility: DocumentTypeVisibility,
  ) => {
    if (!onVisibilityChange) {
      return;
    }

    try {
      await onVisibilityChange(nextVisibility);
      setIsOpen(false);
    } catch (error) {
      handleDocumentTypeError(error, onError);
    }
  };

  const variants: Record<
    DocumentTypeVisibility,
    { variant: "secondary" | "outline"; className?: string }
  > = {
    required: { variant: "secondary" },
    optional: { variant: "outline" },
    hidden: {
      variant: "outline",
      className: "bg-muted text-muted-foreground",
    },
  };
  const config = variants[visibility];
  const badge = (
    <Badge
      variant={config.variant}
      className={cn(
        "text-xs",
        isAdmin && onVisibilityChange && "cursor-pointer hover:bg-accent",
        config.className,
      )}
    >
      {t(`visibility.${visibility}`)}
    </Badge>
  );

  if (!isAdmin || !onVisibilityChange) {
    return badge;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{badge}</PopoverTrigger>
      <PopoverContent className="w-40 p-2" align="end">
        <div className="flex flex-col gap-1">
          <Button
            variant={visibility === "required" ? "secondary" : "ghost"}
            size="sm"
            className="justify-start"
            onClick={() => void handleVisibilityChange("required")}
          >
            {t("visibility.required")}
          </Button>
          <Button
            variant={visibility === "optional" ? "secondary" : "ghost"}
            size="sm"
            className="justify-start"
            onClick={() => void handleVisibilityChange("optional")}
          >
            {t("visibility.optional")}
          </Button>
          <Button
            variant={visibility === "hidden" ? "secondary" : "ghost"}
            size="sm"
            className="justify-start"
            onClick={() => void handleVisibilityChange("hidden")}
          >
            {t("visibility.hidden")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EditDocumentTypeDialog({
  open,
  onOpenChange,
  initialValues,
  onSaveEdit,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues: EditDocumentTypeInput;
  onSaveEdit: (values: EditDocumentTypeInput) => Promise<void>;
  onError?: ErrorHandler;
}) {
  const t = useTranslations("Applications.documents");
  const id = useId();
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState(initialValues);

  useEffect(() => {
    setEditForm(initialValues);
  }, [initialValues]);

  const handleSave = async () => {
    if (!editForm.name.trim()) {
      return;
    }

    setIsSavingEdit(true);
    try {
      await onSaveEdit({
        name: editForm.name.trim(),
        description: editForm.description?.trim() || undefined,
        required: editForm.required,
      });
      onOpenChange(false);
    } catch (error) {
      handleDocumentTypeError(error, onError);
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("actions.editDialog.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor={`${id}-edit-name`}>{t("form.documentName")}</Label>
            <Input
              id={`${id}-edit-name`}
              value={editForm.name}
              onChange={(event) =>
                setEditForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-edit-description`}>
              {t("form.description")}
            </Label>
            <Input
              id={`${id}-edit-description`}
              value={editForm.description ?? ""}
              onChange={(event) =>
                setEditForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id={`${id}-edit-required`}
              checked={editForm.required}
              onChange={(event) =>
                setEditForm((current) => ({
                  ...current,
                  required: event.target.checked,
                }))
              }
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor={`${id}-edit-required`} className="cursor-pointer">
              {t("form.required")}
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("actions.cancel")}
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={isSavingEdit || !editForm.name.trim()}
          >
            {isSavingEdit
              ? t("actions.editDialog.saving")
              : t("actions.editDialog.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDocumentTypeDialog({
  open,
  onOpenChange,
  onDelete,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => Promise<void>;
  onError?: ErrorHandler;
}) {
  const t = useTranslations("Applications.documents");

  const handleDelete = async () => {
    try {
      await onDelete();
      onOpenChange(false);
    } catch (error) {
      handleDocumentTypeError(error, onError);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
            <Trash2 />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {t("actions.deleteTypeDialog.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("actions.deleteTypeDialog.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">
            {t("actions.deleteTypeDialog.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => void handleDelete()}
          >
            {t("actions.deleteTypeDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DocumentTypeCard({
  name,
  description,
  visibility,
  statusBadge,
  className,
  children,
  canEdit = false,
  canDelete = false,
  onSaveEdit,
  onDelete,
  onVisibilityChange,
  onError,
}: DocumentTypeCardProps) {
  const t = useTranslations("Applications.documents");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const hasEditAction = canEdit && !!onSaveEdit;
  const hasDeleteAction = canDelete && !!onDelete;
  const initialValues = {
    name,
    description,
    required: visibility === "required",
  };

  return (
    <Card
      className={cn(
        "transition-colors",
        visibility === "hidden" && "bg-muted/50",
        className,
      )}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{name}</CardTitle>
              <VisibilityBadge
                visibility={visibility}
                onVisibilityChange={onVisibilityChange}
                onError={onError}
              />
            </div>
            {description ? (
              <CardDescription className="mt-1 text-sm">
                {description}
              </CardDescription>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {statusBadge}
            {hasEditAction || hasDeleteAction ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={t("actions.moreOptions")}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  {hasEditAction ? (
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        onClick={() => setIsEditDialogOpen(true)}
                      >
                        <Pencil className="h-4 w-4" />
                        {t("actions.edit")}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  ) : null}
                  {hasEditAction && hasDeleteAction ? (
                    <DropdownMenuSeparator />
                  ) : null}
                  {hasDeleteAction ? (
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setIsDeleteDialogOpen(true)}
                      >
                        <Trash2 className="h-4 w-4" />
                        {t("actions.deleteType")}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      </CardHeader>

      {children ? (
        <CardContent className="space-y-3">{children}</CardContent>
      ) : null}

      {hasEditAction ? (
        <EditDocumentTypeDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          initialValues={initialValues}
          onSaveEdit={onSaveEdit}
          onError={onError}
        />
      ) : null}

      {hasDeleteAction ? (
        <DeleteDocumentTypeDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          onDelete={onDelete}
          onError={onError}
        />
      ) : null}
    </Card>
  );
}
