import { ColumnDef } from "@tanstack/react-table";
import {
  createSearchColumn,
  createSortableHeader,
} from "@/components/table/column-helpers";
import type { FilterConfig } from "@/lib/table/types";
import { BuildingOfficeIcon, ShieldCheckIcon } from "@heroicons/react/20/solid";

export interface OrganizationRow {
  _creationTime: number;
  name: string;
  slug: string;
  logoUrl?: string;
  type: "league" | "club";
  status: "active" | "inactive" | "affiliated" | "invited" | "suspended";
  country?: string;
  region?: string;
  clubCount?: number;
  playerCount?: number;
}

type Translator = (key: string) => string;

const TYPE_STYLES: Record<string, string> = {
  league:
    "text-purple-700 bg-purple-50 dark:text-purple-400 dark:bg-purple-950",
  club: "text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-950",
};

const STATUS_STYLES: Record<string, string> = {
  active: "text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-950",
  inactive: "text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800",
  affiliated:
    "text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-950",
  invited: "text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950",
  suspended: "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950",
};

export function createOrganizationColumns(
  t: Translator,
): ColumnDef<OrganizationRow>[] {
  return [
    createSearchColumn<OrganizationRow>(["name", "slug", "country", "region"]),

    {
      accessorKey: "name",
      header: createSortableHeader(t("organizations.name")),
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          {row.original.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.original.logoUrl}
              alt={row.original.name}
              className="h-8 w-8 rounded-lg object-cover"
            />
          ) : (
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              {row.original.type === "league" ? (
                <ShieldCheckIcon className="h-4 w-4" />
              ) : (
                <BuildingOfficeIcon className="h-4 w-4" />
              )}
            </div>
          )}
          <div>
            <span className="font-medium">{row.original.name}</span>
            <p className="text-xs text-muted-foreground">{row.original.slug}</p>
          </div>
        </div>
      ),
    },

    {
      accessorKey: "type",
      header: t("organizations.type"),
      cell: ({ row }) => {
        const type = row.original.type;
        const className = TYPE_STYLES[type] ?? "";
        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${className}`}
          >
            {type === "league" ? (
              <ShieldCheckIcon className="h-3 w-3" />
            ) : (
              <BuildingOfficeIcon className="h-3 w-3" />
            )}
            {t(`organizationType.${type}`)}
          </span>
        );
      },
      filterFn: (row, id, value: string[]) => {
        return value.includes(row.getValue(id));
      },
    },

    {
      accessorKey: "country",
      header: createSortableHeader(t("organizations.location")),
      cell: ({ row }) => {
        const { country, region } = row.original;
        if (!country) return "—";
        return region ? `${region}, ${country}` : country;
      },
    },

    {
      accessorKey: "clubCount",
      header: () => (
        <div className="text-center">{t("organizations.clubs")}</div>
      ),
      cell: ({ row }) => (
        <div className="text-center font-medium">
          {row.original.type === "league" ? (row.original.clubCount ?? 0) : "—"}
        </div>
      ),
    },

    {
      accessorKey: "status",
      header: t("organizations.status"),
      cell: ({ row }) => {
        const status = row.original.status;
        const className = STATUS_STYLES[status] ?? "";
        return (
          <span
            className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${className}`}
          >
            {t(`organizationStatus.${status}`)}
          </span>
        );
      },
      filterFn: (row, id, value: string[]) => {
        return value.includes(row.getValue(id));
      },
    },
  ];
}

export function createOrganizationFilterConfigs(t: Translator): FilterConfig[] {
  return [
    {
      id: "type",
      label: t("organizations.type"),
      options: [
        { value: "league", label: t("organizationType.league") },
        { value: "club", label: t("organizationType.club") },
      ],
    },
    {
      id: "status",
      label: t("organizations.status"),
      options: [
        { value: "active", label: t("organizationStatus.active") },
        { value: "inactive", label: t("organizationStatus.inactive") },
        { value: "affiliated", label: t("organizationStatus.affiliated") },
        { value: "invited", label: t("organizationStatus.invited") },
        { value: "suspended", label: t("organizationStatus.suspended") },
      ],
    },
  ];
}
