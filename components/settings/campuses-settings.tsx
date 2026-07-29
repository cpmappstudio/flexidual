"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { EllipsisVertical, Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CampusDialog } from "@/components/admin/campuses/campus-dialog";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResponsivePageAction } from "@/components/ui/responsive-page-action";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useSettingsContext } from "@/hooks/use-settings-context";

export function CampusesSettings() {
  const t = useTranslations("settings.campuses");
  const commonT = useTranslations("common");
  const { context, isLoading } = useSettingsContext();
  const campuses = useQuery(
    api.campuses.listForInstitutionSettings,
    context?.canViewInstitutionSettings
      ? { schoolId: context.institution._id }
      : "skip",
  );
  const removeCampus = useMutation(api.campuses.remove);
  type Campus = FunctionReturnType<
    typeof api.campuses.listForInstitutionSettings
  >[number];
  const [deleteTarget, setDeleteTarget] = React.useState<Campus | null>(null);
  const [editTarget, setEditTarget] =
    React.useState<Campus | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  if (isLoading || (context?.canViewInstitutionSettings && campuses === undefined)) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }

  if (!context?.canViewInstitutionSettings) {
    return (
      <section className="grid gap-3">
        <h2 className="border-b pb-3 text-xl font-semibold">
          {t("unavailableTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("unavailableDescription")}
        </p>
      </section>
    );
  }

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const result = await removeCampus({ id: deleteTarget._id });
      if (!result.deleted) {
        toast.error(t("deleteInUse"));
        return;
      }

      toast.success(t("deleted"));
      setDeleteTarget(null);
    } catch {
      toast.error(t("deleteError"));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-4 border-b pb-3">
        <h2 className="min-w-0 text-xl font-semibold">
          {t("title")} — {context.institution.name}
        </h2>
        {context.canManageInstitution && (
          <ResponsivePageAction>
            <CampusDialog
              parentInstitution={{
                _id: context.institution._id,
                name: context.institution.name,
              }}
              trigger={
                <Button
                  size="sm"
                  aria-label={t("add")}
                >
                  <Plus />
                  <span className="hidden sm:inline">{t("add")}</span>
                </Button>
              }
            />
          </ResponsivePageAction>
        )}
      </div>

      <div className="overflow-hidden rounded-md border">
        <Table className="bg-card">
          <TableHeader className="bg-primary/95">
            <TableRow className="hover:bg-transparent data-[state=selected]:bg-transparent">
              <TableHead className="text-muted">{t("name")}</TableHead>
              <TableHead className="text-muted">{t("codeColumn")}</TableHead>
              <TableHead className="text-muted">{t("identifier")}</TableHead>
              <TableHead className="text-muted">{t("principal")}</TableHead>
              <TableHead className="text-muted">{t("status")}</TableHead>
              {context.canManageInstitution && (
                <TableHead className="text-right text-muted">
                  {t("actions")}
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {campuses?.length ? (
              campuses.map((campus) => (
                <TableRow key={campus._id}>
                  <TableCell className="font-medium">{campus.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {campus.code || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    /{campus.slug}
                  </TableCell>
                  <TableCell>{campus.principal?.fullName ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={campus.isActive ? "default" : "secondary"}>
                      {campus.isActive ? t("active") : t("inactive")}
                    </Badge>
                  </TableCell>
                  {context.canManageInstitution && <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground data-[state=open]:bg-muted"
                          aria-label={`${t("actions")}: ${campus.name}`}
                        >
                          <EllipsisVertical />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem onSelect={() => setEditTarget(campus)}>
                          {commonT("edit")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setDeleteTarget(campus)}
                        >
                          {t("deleteConfirm")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={context.canManageInstitution ? 6 : 5}
                  className="h-24 text-center text-muted-foreground"
                >
                  {t("empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {editTarget && (
        <CampusDialog
          campus={editTarget}
          trigger={null}
          open
          onOpenChange={(open) => {
            if (!open) setEditTarget(null);
          }}
        />
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {campuses?.length === 1
                ? t("deleteLastDescription", {
                    name: deleteTarget?.name ?? "",
                  })
                : t("deleteDescription", {
                    name: deleteTarget?.name ?? "",
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {isDeleting && <Loader2 className="animate-spin" />}
              {t("deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
