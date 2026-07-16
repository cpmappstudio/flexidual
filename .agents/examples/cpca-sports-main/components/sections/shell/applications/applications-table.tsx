"use client";

import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation } from "convex/react";
import { Archive, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/components/table/data-table";
import {
  useAdminApplicationColumns,
  useClientApplicationColumns,
  useApplicationFilters,
} from "@/components/sections/shell/applications/columns";
import { formatApplicationDate } from "@/components/sections/shell/applications/date-format";
import { ROUTES } from "@/lib/navigation/routes";
import type { ApplicationListItem } from "@/lib/applications/list-types";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ApplicationPaymentStatusChart } from "./applications-analytics";

interface ApplicationsTableProps {
  applications: ApplicationListItem[];
  organizationSlug: string;
  isAdmin: boolean;
  emptyMessage?: string;
  totalCountLabel?: (count: number) => string;
}

type ArchiveRequest = {
  applications: ApplicationListItem[];
  isArchived: boolean;
  clearSelection?: () => void;
};

export function ApplicationsTable({
  applications,
  organizationSlug,
  isAdmin,
  emptyMessage,
  totalCountLabel,
}: ApplicationsTableProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Applications");
  const tTable = useTranslations("Common.table");
  const tActions = useTranslations("Common.actions");
  const paymentStatusHeader = useMemo(
    () =>
      isAdmin ? (
        <ApplicationPaymentStatusChart applications={applications} />
      ) : undefined,
    [applications, isAdmin],
  );
  const filters = useApplicationFilters(applications);
  const setArchived = useMutation(api.applications.setArchived);
  const [archiveRequest, setArchiveRequest] = useState<ArchiveRequest | null>(
    null,
  );
  const [isArchiving, setIsArchiving] = useState(false);

  const handleRowClick = (application: ApplicationListItem) => {
    router.push(
      ROUTES.org.applications.detail(organizationSlug, application._id),
    );
  };

  const handleCreate = () => {
    router.push(ROUTES.org.applications.create(organizationSlug));
  };

  const handleExport = isAdmin
    ? (rows: ApplicationListItem[]) => {
        const csv = convertToCSV(rows, t, locale);
        downloadCSV(
          csv,
          `applications-${organizationSlug}-${new Date().toISOString().split("T")[0]}.csv`,
        );
      }
    : undefined;

  const openArchiveDialog = useCallback(
    (
      selectedApplications: ApplicationListItem[],
      isArchived: boolean,
      clearSelection?: () => void,
    ) => {
      setArchiveRequest({
        applications: selectedApplications,
        isArchived,
        clearSelection,
      });
    },
    [],
  );

  const renderArchiveIconButton = useCallback(
    (application: ApplicationListItem) => {
      const isRestore = application.isArchived === true;
      const Icon = isRestore ? ArchiveRestore : Archive;
      const label = isRestore
        ? t("archiveActions.restoreOne")
        : t("archiveActions.archiveOne");

      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8 bg-background shadow-xs hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
              onClick={() => openArchiveDialog([application], !isRestore)}
            >
              <Icon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      );
    },
    [openArchiveDialog, t],
  );

  const renderMobileArchiveAction = useCallback(
    (application: ApplicationListItem) => {
      const isRestore = application.isArchived === true;
      const Icon = isRestore ? ArchiveRestore : Archive;
      const label = isRestore
        ? t("archiveActions.restoreOne")
        : t("archiveActions.archiveOne");

      return (
        <DropdownMenuItem
          onSelect={() => openArchiveDialog([application], !isRestore)}
        >
          <Icon className="h-4 w-4" />
          <span>{label}</span>
        </DropdownMenuItem>
      );
    },
    [openArchiveDialog, t],
  );

  const handleConfirmArchive = async () => {
    if (!archiveRequest) {
      return;
    }

    setIsArchiving(true);
    try {
      await Promise.all(
        archiveRequest.applications.map((application) =>
          setArchived({
            applicationId: application._id,
            isArchived: archiveRequest.isArchived,
          }),
        ),
      );
      archiveRequest.clearSelection?.();
      setArchiveRequest(null);
      toast.success(
        archiveRequest.isArchived
          ? t("archiveActions.archiveSuccess", {
              count: archiveRequest.applications.length,
            })
          : t("archiveActions.restoreSuccess", {
              count: archiveRequest.applications.length,
            }),
      );
    } catch (error) {
      console.error("[Applications] Failed to update archive state:", error);
      toast.error(t("archiveActions.error"));
    } finally {
      setIsArchiving(false);
    }
  };

  const adminColumns = useAdminApplicationColumns({
    paymentStatusHeader,
    renderMobileArchiveAction,
  });
  const clientColumns = useClientApplicationColumns();
  const archiveActionColumn = useMemo<ColumnDef<ApplicationListItem>>(
    () => ({
      id: "archiveAction",
      header: "",
      enableHiding: false,
      enableSorting: false,
      cell: ({ row }) => {
        const application = row.original;

        return (
          <div className="flex justify-end">
            {renderArchiveIconButton(application)}
          </div>
        );
      },
      meta: {
        className: "hidden w-12 md:table-cell",
      },
    }),
    [renderArchiveIconButton],
  );

  const columns = useMemo(
    () => (isAdmin ? [...adminColumns, archiveActionColumn] : clientColumns),
    [adminColumns, archiveActionColumn, clientColumns, isAdmin],
  );

  const resultsCountLabel = (
    filtered: number,
    total: number,
    isFiltered: boolean,
  ) => {
    if (isFiltered) {
      return t("table.filteredCount", { count: filtered, total });
    }
    if (totalCountLabel) {
      return totalCountLabel(total);
    }
    return isAdmin
      ? t("table.totalCountAdmin", { count: total })
      : t("table.totalCountClient", { count: total });
  };

  const archiveDialogCount = archiveRequest?.applications.length ?? 0;
  const isBulkArchive = archiveDialogCount > 1;
  const isArchiveAction = archiveRequest?.isArchived === true;

  return (
    <>
      <DataTable
        data={applications}
        columns={columns}
        filterColumn="fullName"
        filterPlaceholder={t("searchPlaceholder")}
        emptyMessage={
          emptyMessage ??
          (isAdmin ? t("emptyMessageAdmin") : t("emptyMessageClient"))
        }
        columnsMenuLabel={tTable("columns")}
        exportButtonLabel={tActions("export")}
        filtersMenuLabel={tTable("filters")}
        filterConfigs={isAdmin ? filters : undefined}
        initialSorting={[{ id: "_creationTime", desc: true }]}
        enableRowSelection={isAdmin}
        resultsCountLabel={resultsCountLabel}
        selectedRowsLabel={(selected, total) =>
          t("archiveActions.selectedRows", { selected, total })
        }
        renderBulkActions={
          isAdmin
            ? (selectedRows, clearSelection) => {
                const shouldRestore = selectedRows.some(
                  (row) => row.isArchived,
                );
                return (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      openArchiveDialog(
                        selectedRows,
                        !shouldRestore,
                        clearSelection,
                      )
                    }
                  >
                    {shouldRestore ? (
                      <ArchiveRestore className="h-4 w-4" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                    <span>
                      {shouldRestore
                        ? t("archiveActions.restoreSelected")
                        : t("archiveActions.archiveSelected")}
                    </span>
                  </Button>
                );
              }
            : undefined
        }
        onCreate={!isAdmin ? handleCreate : undefined}
        onExport={handleExport}
        onRowClick={handleRowClick}
      />

      <AlertDialog
        open={archiveRequest !== null}
        onOpenChange={(open) => {
          if (!open) {
            setArchiveRequest(null);
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia>
              {isArchiveAction ? <Archive /> : <ArchiveRestore />}
            </AlertDialogMedia>
            <AlertDialogTitle>
              {isArchiveAction
                ? isBulkArchive
                  ? t("archiveActions.archiveManyTitle", {
                      count: archiveDialogCount,
                    })
                  : t("archiveActions.archiveOneTitle")
                : isBulkArchive
                  ? t("archiveActions.restoreManyTitle", {
                      count: archiveDialogCount,
                    })
                  : t("archiveActions.restoreOneTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isArchiveAction
                ? isBulkArchive
                  ? t("archiveActions.archiveManyDescription")
                  : t("archiveActions.archiveOneDescription")
                : isBulkArchive
                  ? t("archiveActions.restoreManyDescription")
                  : t("archiveActions.restoreOneDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" disabled={isArchiving}>
              {tActions("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmArchive}
              disabled={isArchiving}
            >
              {isArchiveAction
                ? t("archiveActions.archiveConfirm")
                : t("archiveActions.restoreConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function convertToCSV(
  data: ApplicationListItem[],
  t: ReturnType<typeof useTranslations<"Applications">>,
  locale: string,
): string {
  if (data.length === 0) return "";

  const headers = [
    t("table.exportHeaders.code"),
    t("status"),
    t("fullName"),
    t("table.exportHeaders.email"),
    t("table.exportHeaders.phone"),
    t("program"),
    t("enrollmentYear"),
    t("contact"),
    t("table.exportHeaders.accountEmail"),
    t("table.exportHeaders.createdAt"),
  ];

  const rows = data.map((app) => {
    const fullName =
      `${app.applicant.firstName} ${app.applicant.lastName}`.trim();
    const accountName =
      `${app.account.firstName} ${app.account.lastName}`.trim() ||
      app.account.email;

    return [
      app.applicationCode,
      app.status,
      fullName,
      app.applicant.email,
      app.applicant.telephone,
      app.program.name,
      app.enrollmentYear ?? "",
      accountName,
      app.account.email,
      formatApplicationDate(app._creationTime, locale),
    ];
  });

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    ),
  ].join("\n");

  return csvContent;
}

function downloadCSV(csv: string, filename: string) {
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
