"use client";

import { type ReactNode, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "convex/react";
import Image from "next/image";
import { ChevronDown, Mail, Phone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApplicationPhoto } from "./detail/pre-admission/application-photo";
import { formatApplicationDate } from "./date-format";
import { createSortableHeader } from "@/components/table/column-helpers";
import { getProgramIcon } from "@/lib/programs/icon-catalog";
import type { ApplicationStatus } from "@/lib/applications/types";
import type { ApplicationListItem } from "@/lib/applications/list-types";
import type { FilterConfig } from "@/lib/table/types";
import { formatCurrency } from "@/lib/utils/currency";
import { api } from "@/convex/_generated/api";

function useStatusMap() {
  const t = useTranslations("Applications.statusOptions");
  return {
    pending: { label: t("pending"), variant: "outline" as const },
    reviewing: { label: t("reviewing"), variant: "secondary" as const },
    "pre-admitted": { label: t("pre-admitted"), variant: "default" as const },
    admitted: { label: t("admitted"), variant: "default" as const },
    denied: { label: t("denied"), variant: "destructive" as const },
  };
}

function ApplicantPhotoThumb({
  photoUrl,
  photoStorageId,
  applicationId,
  alt,
  initials,
}: {
  photoUrl?: string;
  photoStorageId?: ApplicationListItem["applicant"]["photoStorageId"];
  applicationId: ApplicationListItem["_id"];
  alt: string;
  initials: string;
}) {
  const [imageError, setImageError] = useState(false);

  if (photoUrl && !imageError) {
    return (
      <Image
        src={photoUrl}
        alt={alt}
        width={40}
        height={40}
        sizes="40px"
        unoptimized
        onError={() => setImageError(true)}
        className="h-10 w-10 rounded-md border object-cover"
      />
    );
  }

  if (photoStorageId) {
    return (
      <ApplicationPhoto
        storageId={photoStorageId}
        applicationId={applicationId}
        alt={alt}
        size="sm"
      />
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary">
      <span className="text-sm font-semibold text-primary-foreground">
        {initials}
      </span>
    </div>
  );
}

function ApplicantCell({
  row,
  t,
  tDetail,
  mobileArchiveAction,
}: {
  row: ApplicationListItem;
  t: ReturnType<typeof useTranslations<"Applications">>;
  tDetail: ReturnType<typeof useTranslations<"Applications.detail">>;
  mobileArchiveAction?: ReactNode;
}) {
  const firstName = row.applicant.firstName;
  const lastName = row.applicant.lastName;
  const program = row.program.name;
  const email = row.applicant.email;
  const telephone = row.applicant.telephone;
  const Icon = getProgramIcon(row.programIconKey ?? program);
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <div className="hidden shrink-0 md:flex">
        <ApplicantPhotoThumb
          photoUrl={row.applicant.photoUrl}
          photoStorageId={row.applicant.photoStorageId}
          applicationId={row._id}
          alt={`${firstName} ${lastName}`}
          initials={initials}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="wrap-break-word font-medium whitespace-normal">
            {firstName} {lastName}
          </div>
          {mobileArchiveAction ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="xs"
                  variant="outline"
                  className="md:hidden"
                  aria-label={t("archiveActions.moreActions")}
                >
                  <span>{t("archiveActions.actions")}</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem asChild>
                  <a
                    href={`tel:${telephone}`}
                    className="flex items-center gap-2"
                  >
                    <Phone className="h-4 w-4" />
                    <span>{tDetail("call")}</span>
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a
                    href={`mailto:${email}`}
                    className="flex items-center gap-2"
                  >
                    <Mail className="h-4 w-4" />
                    <span>{tDetail("email")}</span>
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {mobileArchiveAction}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-1 md:hidden">
              <Button size="icon" variant="ghost" className="h-4 w-4" asChild>
                <a href={`tel:${telephone}`}>
                  <Phone className="h-2 w-2" />
                </a>
              </Button>
              <Button size="icon" variant="ghost" className="h-4 w-4" asChild>
                <a href={`mailto:${email}`}>
                  <Mail className="h-2 w-2" />
                </a>
              </Button>
            </div>
          )}
        </div>
        <div className="mt-1 inline-flex flex-col gap-1 text-xs text-muted-foreground lg:hidden">
          <div className="flex gap-1">
            <span className="font-mono uppercase">{t("program")}:</span>
            <Icon className="h-3 w-3" />
            <span>{program || "-"}</span>
          </div>
          <div>
            <span className="font-mono uppercase">{t("enrollmentYear")}:</span>
            <span>{row.enrollmentYear || "-"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function getAccountDisplayName(row: ApplicationListItem) {
  const fullName = `${row.account.firstName} ${row.account.lastName}`.trim();
  return fullName || row.account.email || "-";
}

function getAccountSortValue(row: ApplicationListItem) {
  const fullName = `${row.account.firstName} ${row.account.lastName}`.trim();
  return (fullName || row.account.email || "").toLowerCase();
}

function getAccountInitials(row: ApplicationListItem) {
  const fromName =
    `${row.account.firstName.charAt(0)}${row.account.lastName.charAt(0)}`.toUpperCase();
  return fromName || row.account.email.charAt(0).toUpperCase() || "U";
}

function ContactCell({ row }: { row: ApplicationListItem }) {
  const accountDisplayName = getAccountDisplayName(row);
  const accountInitials = getAccountInitials(row);

  return (
    <div className="flex flex-col gap-1 font-medium">
      <div className="flex min-w-0 items-center gap-2">
        <Avatar
          src={row.account.imageUrl}
          initials={accountInitials}
          alt={accountDisplayName}
          className="size-6 shrink-0 bg-muted text-muted-foreground"
        />
        <span className="min-w-0 wrap-break-word whitespace-normal">
          {accountDisplayName}
        </span>
      </div>
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Phone className="h-4 w-4" />
        <span>{row.applicant.telephone || "-"}</span>
      </div>
    </div>
  );
}

function getPaymentProgress(summary: ApplicationListItem["paymentSummary"]) {
  if (summary.totalDue <= 0) return 0;

  return Math.min(
    100,
    Math.max(0, (summary.totalPaid / summary.totalDue) * 100),
  );
}

function formatPaymentDueDate(value: string, locale: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function PaymentProgressCell({
  applicationId,
  paymentSummary,
}: {
  applicationId: ApplicationListItem["_id"];
  paymentSummary: ApplicationListItem["paymentSummary"];
}) {
  const locale = useLocale();
  const t = useTranslations("Applications");
  const tPayments = useTranslations("Applications.payments");
  const [open, setOpen] = useState(false);
  const paymentFees = useQuery(
    api.fees.getPaymentDetails,
    open ? { applicationId } : "skip",
  );
  const progress = getPaymentProgress(paymentSummary);
  const roundedProgress = Math.round(progress);
  const label = t("paymentProgress", { progress: roundedProgress });
  const feeStatusMap = {
    pending: {
      label: tPayments("feeStatuses.pending"),
      className: "text-background/70",
    },
    partially_paid: {
      label: tPayments("feeStatuses.partiallyPaid"),
      className: "text-blue-300",
    },
    paid: {
      label: tPayments("feeStatuses.paid"),
      className: "text-green-300",
    },
  };

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          aria-label={label}
          className="relative w-18 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Progress
            value={progress}
            aria-label={label}
            className="h-5 w-full border border-green-500/20"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums text-green-600 dark:text-green-400"
          >
            {roundedProgress}%
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={8}
        className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden border border-background/15 p-0 text-left"
      >
        <div className="border-b border-background/15 p-3">
          <p className="font-semibold">{t("paymentTooltip.title")}</p>
          <div className="mt-2 grid grid-cols-2 gap-4 tabular-nums">
            <div>
              <p className="text-[11px] text-background/70">
                {tPayments("summary.totalPaid")}
              </p>
              <p className="font-semibold text-green-300">
                {formatCurrency(paymentSummary.totalPaid)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-background/70">
                {tPayments("summary.totalDue")}
              </p>
              <p className="font-semibold">
                {formatCurrency(paymentSummary.totalDue)}
              </p>
            </div>
          </div>
          <div className="mt-2 flex justify-between gap-4 border-t border-background/10 pt-2 text-[11px]">
            <span className="text-background/70">
              {tPayments("summary.pending")}
            </span>
            <span className="font-medium tabular-nums text-amber-300">
              {formatCurrency(paymentSummary.totalPending)}
            </span>
          </div>
        </div>

        {paymentFees === undefined ? (
          <p className="p-3 text-background/70">
            {t("paymentTooltip.loading")}
          </p>
        ) : paymentFees.length === 0 ? (
          <p className="p-3 text-background/70">{t("paymentTooltip.noFees")}</p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            {paymentFees.map((fee) => {
              const status = feeStatusMap[fee.status];

              return (
                <div
                  key={fee._id}
                  className="border-b border-background/10 px-3 py-2 last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 font-medium wrap-break-word">
                      {fee.name}
                    </p>
                    <span
                      className={`shrink-0 text-[11px] ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-background/70">
                    <span className="tabular-nums">
                      {formatCurrency(fee.paidAmount)} /{" "}
                      {formatCurrency(fee.totalAmount)}
                    </span>
                    {fee.dueDate && (
                      <span className="shrink-0">
                        {t("paymentTooltip.dueDate", {
                          date: formatPaymentDueDate(fee.dueDate, locale),
                        })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function useApplicationColumnsBase({
  paymentStatusHeader,
  renderMobileArchiveAction,
}: {
  paymentStatusHeader?: ReactNode;
  renderMobileArchiveAction?: (row: ApplicationListItem) => ReactNode;
} = {}) {
  const locale = useLocale();
  const t = useTranslations("Applications");
  const tDetail = useTranslations("Applications.detail");
  const statusMap = useStatusMap();

  return useMemo<ColumnDef<ApplicationListItem>[]>(() => {
    const fullNameHeader = (
      <>
        <span className="hidden lg:block">{t("fullName")}</span>
        <span className="lg:hidden">{t("athlete")}</span>
      </>
    );
    const PaymentSortableHeader = createSortableHeader(t("payment"), {
      className: "h-10 w-full justify-start px-2 pt-1.5",
    });

    return [
      {
        accessorKey: "_creationTime",
        header: createSortableHeader(t("date")),
        cell: ({ row }) => {
          return formatApplicationDate(
            row.getValue("_creationTime") as number,
            locale,
          );
        },
        meta: {
          className: "hidden md:table-cell",
        },
      },
      {
        id: "fullName",
        header: createSortableHeader(fullNameHeader),
        accessorFn: (row) =>
          `${row.applicant.firstName} ${row.applicant.lastName}`.trim(),
        cell: ({ row }) => (
          <ApplicantCell
            row={row.original}
            t={t}
            tDetail={tDetail}
            mobileArchiveAction={renderMobileArchiveAction?.(row.original)}
          />
        ),
      },
      {
        id: "program",
        header: createSortableHeader(t("program")),
        accessorFn: (row) => row.program.name,
        cell: ({ row }) => {
          const program = row.original.program.name;
          const Icon = getProgramIcon(row.original.programIconKey ?? program);
          return (
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span>{program || "-"}</span>
            </div>
          );
        },
        meta: {
          className: "hidden lg:table-cell",
        },
        filterFn: (row, id, value) => {
          return value.includes(row.getValue(id));
        },
      },
      {
        accessorKey: "enrollmentYear",
        header: createSortableHeader(t("enrollmentYear")),
        cell: ({ row }) => row.getValue("enrollmentYear") || "-",
        meta: {
          className: "hidden xl:table-cell",
        },
      },
      {
        id: "contact",
        header: createSortableHeader(t("contact")),
        accessorFn: (row) => getAccountSortValue(row),
        cell: ({ row }) => <ContactCell row={row.original} />,
        meta: {
          className: "hidden md:table-cell",
        },
      },

      {
        id: "paymentProgress",
        header: ({ column }) => (
          <div className="relative h-10 w-full">
            {paymentStatusHeader ? (
              <div className="absolute inset-x-0 top-0 z-20">
                {paymentStatusHeader}
              </div>
            ) : null}
            <PaymentSortableHeader column={column} />
          </div>
        ),
        accessorFn: (row) => getPaymentProgress(row.paymentSummary),
        cell: ({ row }) => (
          <PaymentProgressCell
            applicationId={row.original._id}
            paymentSummary={row.original.paymentSummary}
          />
        ),
        meta: {
          className: "w-24",
          headerClassName: "relative p-0",
        },
      },
      {
        accessorKey: "status",
        header: createSortableHeader(t("status")),
        cell: ({ row }) => {
          const status = row.getValue("status") as ApplicationStatus;
          const statusInfo = statusMap[status];
          return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
        },
        filterFn: (row, id, value) => {
          return value.includes(row.getValue(id));
        },
      },
      {
        id: "sex",
        accessorFn: (row) => row.sex ?? "",
        enableHiding: false,
        meta: {
          className: "hidden",
        },
        filterFn: (row, id, value) => {
          return value.includes(row.getValue(id));
        },
      },
    ];
  }, [
    locale,
    paymentStatusHeader,
    renderMobileArchiveAction,
    statusMap,
    t,
    tDetail,
  ]);
}

export function useAdminApplicationColumns({
  paymentStatusHeader,
  renderMobileArchiveAction,
}: {
  paymentStatusHeader?: ReactNode;
  renderMobileArchiveAction?: (row: ApplicationListItem) => ReactNode;
} = {}) {
  return useApplicationColumnsBase({
    paymentStatusHeader,
    renderMobileArchiveAction,
  });
}

export function useClientApplicationColumns() {
  return useApplicationColumnsBase();
}

export function useApplicationFilters(
  applications: ApplicationListItem[],
): FilterConfig[] {
  const t = useTranslations("Applications");
  const tStatus = useTranslations("Applications.statusOptions");
  const tAthlete = useTranslations("preadmission.athlete");

  return useMemo(() => {
    const countValues = (values: string[]) =>
      values.reduce<Record<string, number>>((counts, value) => {
        counts[value] = (counts[value] ?? 0) + 1;
        return counts;
      }, {});

    const statusCounts = countValues(applications.map((row) => row.status));
    const programs = [...new Set(applications.map((row) => row.program.name))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    const programCounts = countValues(
      applications.map((row) => row.program.name).filter(Boolean),
    );
    const sexCounts = countValues(
      applications
        .map((row) => row.sex)
        .filter((value): value is NonNullable<ApplicationListItem["sex"]> =>
          Boolean(value),
        ),
    );

    const filters: FilterConfig[] = [
      {
        id: "status",
        label: t("status"),
        options: [
          {
            value: "pending",
            label: tStatus("pending"),
            count: statusCounts.pending ?? 0,
          },
          {
            value: "reviewing",
            label: tStatus("reviewing"),
            count: statusCounts.reviewing ?? 0,
          },
          {
            value: "pre-admitted",
            label: tStatus("pre-admitted"),
            count: statusCounts["pre-admitted"] ?? 0,
          },
          {
            value: "admitted",
            label: tStatus("admitted"),
            count: statusCounts.admitted ?? 0,
          },
          {
            value: "denied",
            label: tStatus("denied"),
            count: statusCounts.denied ?? 0,
          },
        ],
      },
      {
        id: "program",
        label: t("program"),
        options: programs.map((program) => ({
          value: program,
          label: program,
          count: programCounts[program] ?? 0,
        })),
      },
    ];

    const sexOptions = [
      { value: "male", label: tAthlete("sexMale") },
      { value: "female", label: tAthlete("sexFemale") },
      { value: "other", label: tAthlete("sexOther") },
    ]
      .filter((option) => (sexCounts[option.value] ?? 0) > 0)
      .map((option) => ({
        ...option,
        count: sexCounts[option.value] ?? 0,
      }));

    if (sexOptions.length > 0) {
      filters.splice(1, 0, {
        id: "sex",
        label: tAthlete("sex"),
        options: sexOptions,
      });
    }

    return filters;
  }, [applications, t, tAthlete, tStatus]);
}
