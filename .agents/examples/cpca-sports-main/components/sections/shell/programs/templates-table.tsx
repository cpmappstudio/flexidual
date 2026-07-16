"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/table/data-table";
import {
  createSearchColumn,
  createSortableHeader,
} from "@/components/table/column-helpers";
import {
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import type { Doc } from "@/convex/_generated/dataModel";

interface TemplatesTableProps {
  templates: Doc<"formTemplates">[];
  busyTemplateId: Doc<"formTemplates">["_id"] | null;
  onEdit: (templateId: Doc<"formTemplates">["_id"]) => void;
  onDelete: (template: Doc<"formTemplates">) => void;
}

export function TemplatesTable({
  templates,
  busyTemplateId,
  onEdit,
  onDelete,
}: TemplatesTableProps) {
  const t = useTranslations("Programs");
  const tTable = useTranslations("Common.table");
  const tActions = useTranslations("Common.actions");

  const columns = useMemo<ColumnDef<Doc<"formTemplates">>[]>(
    () => [
      createSearchColumn<Doc<"formTemplates">>(["name", "description"]),
      {
        accessorKey: "name",
        header: createSortableHeader(t("templatesTable.columns.name")),
        cell: ({ row }) => {
          const template = row.original;

          return (
            <div className="min-w-0">
              <p className="truncate font-medium" title={template.name}>
                {template.name}
              </p>
              <p
                className="truncate text-xs text-muted-foreground"
                title={
                  template.description ??
                  t("templatesTable.descriptionFallback")
                }
              >
                {template.description ??
                  t("templatesTable.descriptionFallback")}
              </p>
            </div>
          );
        },
      },
      {
        accessorKey: "version",
        header: createSortableHeader(t("templatesTable.columns.version")),
        meta: { className: "w-[110px]" },
      },
      {
        id: "sectionsCount",
        accessorFn: (row) => row.sections.length,
        header: createSortableHeader(t("templatesTable.columns.sections")),
        meta: { className: "w-[130px]" },
      },
    ],
    [t],
  );

  return (
    <DataTable
      data={templates}
      columns={columns}
      filterColumn="search"
      filterPlaceholder={t("templatesTable.searchPlaceholder")}
      emptyMessage={t("templatesTable.emptyMessage")}
      columnsMenuLabel={tTable("columns")}
      filtersMenuLabel={tTable("filters")}
      resultsCountLabel={(filtered, total, isFiltered) =>
        isFiltered
          ? t("templatesTable.filteredCount", { count: filtered, total })
          : t("templatesTable.totalCount", { count: total })
      }
      onRowClick={(row) => onEdit(row._id)}
      renderRowContextMenu={(row) => (
        <>
          <ContextMenuGroup>
            <ContextMenuItem onSelect={() => onEdit(row._id)}>
              <Pencil className="h-4 w-4" />
              {tActions("edit")}
            </ContextMenuItem>
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuItem
              disabled={busyTemplateId === row._id}
              onSelect={() => onDelete(row)}
              variant="destructive"
            >
              <Trash2 className="h-4 w-4" />
              {tActions("delete")}
            </ContextMenuItem>
          </ContextMenuGroup>
        </>
      )}
    />
  );
}
