"use client";

import { useState } from "react";
import { CalendarDays, CalendarPlus, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CalendarEventFormDialog } from "@/components/calendar/dialog/calendar-event-form-dialog";

export default function CalendarEventActions({
  schoolId,
  campusId,
  schoolTimeZone,
  selectedDate,
  canCreate,
  canCreateInstitution,
  onViewEvents,
  onCreated,
}: {
  schoolId?: Id<"schools">;
  campusId?: Id<"campuses">;
  schoolTimeZone: string;
  selectedDate: string;
  canCreate: boolean;
  canCreateInstitution: boolean;
  onViewEvents: () => void;
  onCreated: (eventId: Id<"events">) => void;
}) {
  const t = useTranslations("events");
  const [createOpen, setCreateOpen] = useState(false);
  if (!canCreate || !schoolId)
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={t("viewAll")}
        onClick={onViewEvents}
      >
        <CalendarDays className="size-4 sm:hidden" aria-hidden="true" />
        <span className="hidden sm:inline">{t("viewAll")}</span>
      </Button>
    );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" aria-label={t("name")}>
            <CalendarDays className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t("name")}</span>
            <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <CalendarPlus className="size-4" aria-hidden="true" />
            {t("create")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onViewEvents}>
            <CalendarDays className="size-4" aria-hidden="true" />
            {t("viewAll")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CalendarEventFormDialog
        schoolId={schoolId}
        campusId={campusId}
        schoolTimeZone={schoolTimeZone}
        selectedDate={selectedDate}
        canCreateInstitution={canCreateInstitution}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={onCreated}
      />
    </>
  );
}
