"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { ArrowLeft, BookOpen } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import type { WhiteboardEditorProps } from "./whiteboard-editor";

const CourseNotebook = dynamic(
  () => import("./course-notebook").then((module) => module.CourseNotebook),
  { ssr: false },
);

/** Gallery and editor are mutually exclusive; unmounting uses the normal save/close flow. */
export function NotebookPagePicker({
  classId,
  onSelectPage,
  children,
}: {
  classId: Id<"classes">;
  onSelectPage: (
    pageId: Id<"courseNotebookPages">,
    title: string,
  ) => Promise<void> | void;
  children: (
    renderTopRightUI: NonNullable<WhiteboardEditorProps["renderTopRightUI"]>,
  ) => ReactNode;
}) {
  const t = useTranslations("courseNotebook");
  const common = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const selecting = useRef(false);
  const gallery = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open) gallery.current?.focus({ preventScroll: true });
  }, [open]);
  async function select(operation: () => Promise<void> | void) {
    if (selecting.current) return;
    selecting.current = true;
    setBusy(true);
    try {
      await operation();
      setOpen(false);
    } catch {
      toast.error(t("operationFailed"));
    } finally {
      selecting.current = false;
      setBusy(false);
    }
  }
  return (
    <div
      className="h-full min-h-0 w-full overflow-hidden"
      data-slot="board-workspace"
    >
      {open ? (
        <section
          ref={gallery}
          tabIndex={-1}
          className="h-full overflow-y-auto overscroll-contain p-3"
          aria-label={t("tab")}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {common("back")}
            </Button>
            <h2 className="text-lg font-semibold">{t("tab")}</h2>
          </div>
          <div inert={busy} aria-busy={busy}>
            <CourseNotebook
              classId={classId}
              onSelectPage={(id, title) =>
                select(() => onSelectPage(id, title))
              }
            />
          </div>
        </section>
      ) : (
        children((isMobile) => (
          <Button
            type="button"
            variant="outline"
            size={isMobile ? "icon" : "default"}
            title={t("tab")}
            onClick={() => setOpen(true)}
          >
            <BookOpen className="size-4" aria-hidden="true" />
            <span className={isMobile ? "sr-only" : undefined}>{t("tab")}</span>
          </Button>
        ))
      )}
    </div>
  );
}
