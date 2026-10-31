"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useFormatter, useTranslations } from "next-intl";
import { ArchiveRestore, NotebookPen, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { PreviewCard } from "@/components/ui/preview-card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { NotebookPagePicker } from "./notebook-page-picker";
import { NotebookPageTitle } from "./notebook-page-title";

const PageEditor = dynamic(
  () =>
    import("./notebook-page-editor").then(
      (module) => module.NotebookPageEditor,
    ),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
);

/** The same notebook browser can be mounted in a course tab or a classroom panel. */
export function CourseNotebook({
  classId,
  onSelectPage,
}: {
  classId: Id<"classes">;
  onSelectPage?: (
    pageId: Id<"courseNotebookPages">,
    title: string,
  ) => Promise<void> | void;
}) {
  const t = useTranslations("courseNotebook");
  const common = useTranslations("common");
  const format = useFormatter();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim());
  const notebook = useQuery(api.courseNotebook.get, { classId });
  const initialize = useMutation(api.courseNotebook.initialize);
  const createPage = useMutation(api.courseNotebook.createPage);
  const setArchived = useMutation(api.courseNotebook.setArchived);
  const [selected, setSelected] = useState<{
    id: Id<"courseNotebookPages">;
    title: string;
  }>();
  const titleSaved = useCallback(
    (pageId: Id<"courseNotebookPages">, title: string) => {
      setSelected((current) =>
        current?.id === pageId ? { ...current, title } : current,
      );
    },
    [],
  );
  const { results, status, loadMore } = usePaginatedQuery(
    api.courseNotebook.listPages,
    notebook?.initialized && !notebook.archived
      ? { classId, search: debouncedSearch }
      : "skip",
    { initialNumItems: 20 },
  );
  const [busy, setBusy] = useState(false);
  const editorPanel = useRef<HTMLDivElement>(null);
  const [initializationFailed, setInitializationFailed] = useState(false);
  const initialized = notebook?.initialized;
  useEffect(() => {
    if (initialized !== false) return;
    let active = true;
    void initialize({ classId }).catch(() => {
      if (active) setInitializationFailed(true);
    });
    return () => {
      active = false;
    };
  }, [classId, initialize, initialized]);

  async function run(operation: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await operation();
    } catch {
      toast.error(t("operationFailed"));
    } finally {
      setBusy(false);
    }
  }

  function select(id: Id<"courseNotebookPages">, name: string) {
    if (onSelectPage) return onSelectPage(id, name);
    setSelected({ id, title: name });
  }

  if (!notebook?.initialized)
    return initializationFailed ? (
      <Button
        onClick={() =>
          void run(async () => {
            await initialize({ classId });
            setInitializationFailed(false);
          })
        }
        disabled={busy}
      >
        {t("retry")}
      </Button>
    ) : (
      <Skeleton className="h-48 w-full rounded-2xl" />
    );

  return (
    <section
      className="space-y-4"
      aria-label={t("tab")}
      inert={Boolean(selected) && !notebook.archived}
      aria-hidden={Boolean(selected) && !notebook.archived ? true : undefined}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {!notebook.archived && (
          <InputGroup className="w-auto min-w-0 flex-1 bg-card">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              aria-label={common("searchByName")}
              placeholder={common("searchByName")}
              value={search}
              maxLength={200}
              onChange={(event) => setSearch(event.target.value)}
              className="max-w-sm"
            />
          </InputGroup>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {notebook.canArchive && notebook.archived && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(() => setArchived({ classId, archived: false }))
              }
            >
              <ArchiveRestore className="size-4" />
              {t("restore")}
            </Button>
          )}
          {notebook.canEdit && !notebook.archived && (
            <Button
              size="icon"
              className="sm:w-auto sm:px-3"
              title={t("newPage")}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const id = await createPage({ classId });
                  await select(id, "");
                })
              }
            >
              <Plus className="size-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{t("newPage")}</span>
            </Button>
          )}
        </div>
      </div>
      {notebook.archived ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
          {t("archived")}
        </p>
      ) : (
        <>
          {status === "LoadingFirstPage" ? (
            <Skeleton className="h-48 w-full rounded-2xl" />
          ) : results.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
              {debouncedSearch ? common("noResults") : t("empty")}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {results.map((page) => (
                <button
                  key={page._id}
                  type="button"
                  className="min-w-0 self-start rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() =>
                    onSelectPage
                      ? void run(async () => select(page._id, page.title))
                      : select(page._id, page.title)
                  }
                >
                  <PreviewCard
                    title={page.title}
                    media={
                      <>
                        {page.previewUrl ? (
                          <Image
                            src={page.previewUrl}
                            alt=""
                            fill
                            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, (max-width: 1536px) 33vw, 25vw"
                            className="object-contain"
                            unoptimized
                          />
                        ) : (
                          <NotebookPen
                            className="size-12 text-muted-foreground"
                            aria-hidden="true"
                          />
                        )}
                      </>
                    }
                  >
                    <p className="mt-1 text-xs text-muted-foreground">
                      {format.dateTime(page._creationTime, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        ...(notebook.timeZone
                          ? { timeZone: notebook.timeZone }
                          : {}),
                      })}
                    </p>
                  </PreviewCard>
                </button>
              ))}
            </div>
          )}
          {status !== "Exhausted" && status !== "LoadingFirstPage" && (
            <Button
              variant="outline"
              disabled={status === "LoadingMore"}
              onClick={() => loadMore(20)}
            >
              {t("loadMore")}
            </Button>
          )}
        </>
      )}
      <Dialog
        // The SDK portals its own modal windows to body; an outer modal would make them inert.
        modal={false}
        open={Boolean(selected) && !notebook.archived}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
      >
        {selected && !notebook.archived && (
          <DialogPortal>
            <div
              data-slot="board-backdrop"
              className="fixed inset-0 z-50 overflow-hidden overscroll-none bg-inverse/50"
              aria-hidden="true"
            />
          </DialogPortal>
        )}
        <DialogContent
          ref={editorPanel}
          className="flex h-[95dvh] max-w-[96vw] flex-col gap-3 overflow-hidden overscroll-none p-3 sm:max-w-[96vw]"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            // SDK text editing, selection and windows own Escape; do not close their workspace.
            if (
              (event.target instanceof Node &&
                !editorPanel.current?.contains(event.target)) ||
              (event.target instanceof Element &&
                event.target.closest(".excalidraw"))
            )
              event.preventDefault();
          }}
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">{t("tab")}</DialogTitle>
          <div className="min-h-0 flex-1">
            {selected && !notebook.archived && (
              <NotebookPagePicker classId={classId} onSelectPage={select}>
                {(renderTopRightUI) => (
                  <div className="flex h-full min-h-0 flex-col gap-3">
                    <div className="pr-8">
                      <NotebookPageTitle
                        key={`${selected.id}:${notebook.canEdit}`}
                        pageId={selected.id}
                        title={
                          results.find((page) => page._id === selected.id)
                            ?.title || selected.title
                        }
                        canEdit={notebook.canEdit}
                        onSaved={titleSaved}
                      />
                    </div>
                    <div className="min-h-0 flex-1">
                      <PageEditor
                        key={selected.id}
                        pageId={selected.id}
                        canEdit={notebook.canEdit}
                        renderTopRightUI={renderTopRightUI}
                      />
                    </div>
                  </div>
                )}
              </NotebookPagePicker>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
