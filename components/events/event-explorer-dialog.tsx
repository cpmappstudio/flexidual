"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Search, X } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { EventDetail } from "@/components/events/event-detail";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useEventDirectory } from "@/hooks/use-event-directory";
import { cn } from "@/lib/utils";

function EventExplorerContent({
  orgSlug,
  initialEventId,
  focusRecordings,
  recordingId,
  onClose,
}: {
  orgSlug: string;
  initialEventId?: Id<"events"> | null;
  focusRecordings: boolean;
  recordingId?: Id<"recordings"> | null;
  onClose: () => void;
}) {
  const t = useTranslations("events");
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"events"> | null>(
    initialEventId ?? null,
  );
  const [showMobileDetail, setShowMobileDetail] = useState(
    Boolean(initialEventId),
  );
  const [recordingsRequested, setRecordingsRequested] =
    useState(focusRecordings);
  const [selectedRecordingId, setSelectedRecordingId] = useState(recordingId);
  const debouncedSearch = useDebouncedValue(search.trim());
  const { context, org, results, status, loadMore } = useEventDirectory(
    orgSlug,
    debouncedSearch,
  );
  const activeId = selectedId ?? results[0]?._id;

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <aside
        className={cn(
          "min-h-0 w-full flex-col border-r border-border/70 md:flex md:w-80 md:shrink-0",
          showMobileDetail ? "hidden" : "flex",
        )}
        aria-label={t("name")}
      >
        <div className="border-b border-border/70 p-4 pr-16 md:pr-4">
          <InputGroup>
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={search}
              onChange={(change) => {
                setSearch(change.target.value);
                setSelectedId(null);
                setShowMobileDetail(false);
                setRecordingsRequested(false);
                setSelectedRecordingId(null);
              }}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
            />
          </InputGroup>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {context === null || org === null ? (
            <p className="p-4 text-sm text-muted-foreground">
              {t("selectInstitution")}
            </p>
          ) : status === "LoadingFirstPage" ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : results.length === 0 && status === "Exhausted" ? (
            <p className="p-4 text-sm text-muted-foreground">
              {debouncedSearch ? t("noResults") : t("noEvents")}
            </p>
          ) : (
            <ItemGroup className="gap-1 p-2">
              {results.map((event) => (
                <div key={event._id} role="listitem">
                  <Item
                    asChild
                    size="sm"
                    className={cn(
                      "border-l-4 hover:bg-accent/50",
                      activeId === event._id
                        ? "border-l-primary bg-primary/10 hover:bg-primary/15"
                        : "border-l-transparent",
                    )}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      aria-current={activeId === event._id ? "true" : undefined}
                      onClick={() => {
                        setSelectedId(event._id);
                        setShowMobileDetail(true);
                        setRecordingsRequested(false);
                        setSelectedRecordingId(null);
                      }}
                    >
                      <ItemContent>
                        <ItemTitle className="line-clamp-1 text-left">
                          {event.title}
                        </ItemTitle>
                        <ItemDescription className="text-left">
                          {event.campusName ?? t("scopeInstitution")} ·{" "}
                          {event.gradeCodes?.length
                            ? t("selectedGrades", {
                                grades: event.gradeCodes.join(", "),
                              })
                            : t(
                                event.campusId
                                  ? "wholeCampus"
                                  : "wholeInstitution",
                              )}
                        </ItemDescription>
                        <ItemDescription className="text-left">
                          {event.nextOccurrenceStart === null
                            ? t("noUpcoming")
                            : `${t("nextSession")}: ${new Intl.DateTimeFormat(
                                locale,
                                {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                  timeZone: event.timeZone,
                                },
                              ).format(event.nextOccurrenceStart)}`}
                        </ItemDescription>
                      </ItemContent>
                    </button>
                  </Item>
                </div>
              ))}
            </ItemGroup>
          )}
          {(status === "CanLoadMore" || status === "LoadingMore") &&
            results.length > 0 && (
              <div className="p-3 text-center">
                <Button
                  variant="outline"
                  disabled={status === "LoadingMore"}
                  onClick={() => loadMore(30)}
                >
                  {t("loadMore")}
                </Button>
              </div>
            )}
        </ScrollArea>
      </aside>
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col",
          showMobileDetail ? "flex" : "hidden md:flex",
        )}
      >
        <div className="border-b border-border/70 p-3 md:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowMobileDetail(false)}
          >
            <ArrowLeft aria-hidden="true" />
            {t("backToEvents")}
          </Button>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          {activeId ? (
            <EventDetail
              key={activeId}
              eventId={activeId}
              orgSlug={orgSlug}
              focusRecordings={recordingsRequested}
              recordingId={selectedRecordingId}
              onDeleted={onClose}
            />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">{t("noEvents")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function EventExplorerDialog({
  open,
  onOpenChange,
  orgSlug,
  initialEventId,
  focusRecordings = false,
  recordingId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug: string;
  initialEventId?: Id<"events"> | null;
  focusRecordings?: boolean;
  recordingId?: Id<"recordings"> | null;
}) {
  const t = useTranslations("events");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-dvh w-screen min-w-0 max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">{t("name")}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("viewAll")}
        </DialogDescription>
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3 z-10 size-10"
            aria-label={t("closeExplorer")}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </DialogClose>
        {open && (
          <EventExplorerContent
            key={`${initialEventId ?? "all"}:${focusRecordings}:${recordingId ?? ""}`}
            orgSlug={orgSlug}
            initialEventId={initialEventId}
            focusRecordings={focusRecordings}
            recordingId={recordingId}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
