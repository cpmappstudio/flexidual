"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Input } from "@/components/ui/input";

/** Keyed by page: delayed renames can never target the next open sheet. */
export function NotebookPageTitle({
  pageId,
  title,
  canEdit,
  onSaved,
}: {
  pageId: Id<"courseNotebookPages">;
  title: string;
  canEdit: boolean;
  onSaved: (pageId: Id<"courseNotebookPages">, title: string) => void;
}) {
  const t = useTranslations("courseNotebook");
  const rename = useMutation(api.courseNotebook.renamePage);
  const [value, setValue] = useState(title);
  const pending = useRef(title);
  const saved = useRef(title);
  const submitted = useRef(title);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef(0);
  const requestId = useRef(0);
  const save = useCallback(() => {
    clearTimeout(timer.current);
    const next = pending.current.trim();
    if (!canEdit || !next || next === submitted.current) return;
    submitted.current = next;
    const request = ++requestId.current;
    inFlight.current++;
    // Submit in edit order; a late response never changes the input or queues an older name.
    void rename({ pageId, title: next })
      .then(() => {
        if (requestId.current === request) {
          saved.current = next;
          onSaved(pageId, next);
        }
      })
      .catch(() => {
        if (requestId.current === request) {
          submitted.current = saved.current;
          toast.error(t("operationFailed"));
        }
      })
      .finally(() => {
        inFlight.current--;
      });
  }, [canEdit, pageId, rename, t, onSaved]);

  useEffect(() => {
    if (!inFlight.current && pending.current.trim() === saved.current) {
      pending.current = saved.current = submitted.current = title;
      setValue(title);
    }
  }, [title]);
  useEffect(() => {
    if (!canEdit) return;
    const hidden = () => {
      if (document.visibilityState === "hidden") save();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        inFlight.current ||
        (pending.current.trim() && pending.current.trim() !== saved.current)
      ) {
        save();
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("pagehide", save);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", save);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", hidden);
      save();
    };
  }, [canEdit, save]);

  if (!canEdit) return <h2 className="text-lg font-semibold">{title}</h2>;
  return (
    <Input
      aria-label={t("pageName")}
      value={value}
      maxLength={200}
      placeholder={title}
      className="h-auto border-transparent bg-transparent px-0 py-0 text-lg font-semibold shadow-none md:text-lg"
      onChange={(event) => {
        const next = event.target.value;
        pending.current = next;
        setValue(next);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void save(), 600);
      }}
      onBlur={() => {
        if (!pending.current.trim()) {
          pending.current = saved.current;
          setValue(saved.current);
        }
        void save();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
