"use client";

import { Autocomplete } from "@base-ui/react/autocomplete";
import { useEffect, useRef, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { ClipboardList, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { InputGroupInput } from "@/components/ui/input-group";
import {
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
} from "@/components/ui/combobox-multiple";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentMinute } from "@/hooks/use-current-minute";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { taskChatReference } from "@/lib/chat-references";
import {
  chatDraftParts,
  chatDraftText,
  chatDraftSlashQuery,
  updateChatDraft,
  sliceChatDraft,
} from "@/lib/chat-reference-draft";

export function CourseChatReferenceInput({
  courseId,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  courseId: Id<"classes">;
  value: string;
  onChange: (body: string) => void;
  disabled: boolean;
  placeholder: string;
}) {
  const t = useTranslations("classroom");
  const input = useRef<HTMLInputElement>(null);
  const formatted = useRef<HTMLSpanElement>(null);
  const parts = chatDraftParts(value);
  const text = parts.map((part) => part.text).join("");
  const selection = useRef({ start: text.length, end: text.length });
  const [caret, setCaret] = useState(text.length);
  const [dismissed, setDismissed] = useState(false);
  const history = useRef({
    entries: [{ body: value, caret: text.length }],
    index: 0,
  });
  if (history.current.entries[history.current.index].body !== value)
    history.current = {
      entries: [{ body: value, caret: text.length }],
      index: 0,
    };
  const trigger = chatDraftSlashQuery(value, caret);
  const open = !disabled && !dismissed && trigger !== null;
  const search = useDebouncedValue(trigger?.search ?? "", 200);
  const now = useCurrentMinute();
  const { results, status, loadMore } = usePaginatedQuery(
    api.courseChatMessages.listReferenceTasks,
    open ? { classId: courseId, now, search } : "skip",
    { initialNumItems: 20 },
  );
  useEffect(() => {
    if (open && results.length === 0 && status === "CanLoadMore") loadMore(20);
  }, [open, results.length, status, loadMore]);
  const loading =
    status === "LoadingFirstPage" ||
    status === "LoadingMore" ||
    search !== trigger?.search;

  function syncScroll() {
    if (formatted.current && input.current)
      formatted.current.style.transform = `translateX(${-input.current.scrollLeft}px)`;
  }

  function moveCaret(position: number) {
    selection.current = { start: position, end: position };
    setCaret(position);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(position, position);
      syncScroll();
    });
  }

  function changeBody(body: string, position: number) {
    if (body.length > 2000) {
      toast.error(t("taskReferences.tooLong"));
      return false;
    }
    const entries = history.current.entries.slice(0, history.current.index + 1);
    if (entries.at(-1)?.body !== body) entries.push({ body, caret: position });
    history.current = {
      entries: entries.slice(-50),
      index: Math.min(entries.length, 50) - 1,
    };
    onChange(body);
    return true;
  }

  function restoreHistory(direction: number) {
    const index = history.current.index + direction;
    const entry = history.current.entries[index];
    if (!entry) return;
    history.current.index = index;
    onChange(entry.body);
    moveCaret(entry.caret);
    setDismissed(true);
  }

  function changeText(next: string, position: number) {
    const body = updateChatDraft(value, next, selection.current, position);
    const nextPosition = chatDraftText(next.slice(0, position)).length;
    if (!changeBody(body, nextPosition)) return;
    selection.current = { start: nextPosition, end: nextPosition };
    setCaret(nextPosition);
    if (chatDraftText(body) !== next) moveCaret(nextPosition);
    setDismissed(false);
  }

  return (
    <Autocomplete.Root
      items={results}
      value={text}
      mode="none"
      open={open}
      autoHighlight="always"
      onOpenChange={(next) => {
        if (!next) setDismissed(true);
      }}
      itemToStringValue={(task) => taskChatReference(task.taskId, task.title)}
      onValueChange={(next, details) => {
        if (details.reason === "escape-key") return;
        const nativeEvent = (
          "nativeEvent" in details.event
            ? details.event.nativeEvent
            : details.event
        ) as InputEvent;
        if (
          nativeEvent.inputType === "historyUndo" ||
          nativeEvent.inputType === "historyRedo"
        ) {
          restoreHistory(nativeEvent.inputType === "historyUndo" ? -1 : 1);
          return;
        }
        if (details.reason === "item-press" && trigger) {
          const body =
            value.slice(0, trigger.start) +
            next +
            " " +
            value.slice(trigger.end);
          const position = chatDraftText(
            value.slice(0, trigger.start) + next + " ",
          ).length;
          if (!changeBody(body, position)) return;
          setDismissed(true);
          moveCaret(position);
        } else {
          changeText(next, input.current?.selectionStart ?? next.length);
        }
      }}
    >
      <div className="relative min-w-0 flex-1 self-stretch">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-3 py-1 text-sm sm:text-base md:text-sm"
          style={{ opacity: disabled ? 0.5 : undefined }}
        >
          <span ref={formatted} className="whitespace-pre">
            {parts.map((part, index) => (
              <span
                key={index}
                data-chat-draft-reference={part.taskId ? "" : undefined}
                className={
                  part.taskId
                    ? "text-primary underline underline-offset-2"
                    : undefined
                }
              >
                {part.text}
              </span>
            ))}
          </span>
        </div>
        <Autocomplete.Input
          ref={input}
          render={<InputGroupInput />}
          role={open ? "combobox" : "textbox"}
          aria-label={t("chatPlaceholder")}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={2000}
          className="h-full text-sm caret-foreground sm:text-base"
          style={{ color: "transparent" }}
          onScroll={syncScroll}
          onCopy={(event) => {
            const start = event.currentTarget.selectionStart ?? 0;
            const end = event.currentTarget.selectionEnd ?? start;
            if (start === end) return;
            event.preventDefault();
            event.clipboardData.setData("text/plain", text.slice(start, end));
            event.clipboardData.setData(
              "application/x-flexidual-chat",
              sliceChatDraft(value, start, end),
            );
          }}
          onPaste={(event) => {
            const source = event.clipboardData.getData(
              "application/x-flexidual-chat",
            );
            if (!source) return;
            event.preventDefault();
            const start = event.currentTarget.selectionStart ?? text.length;
            const end = event.currentTarget.selectionEnd ?? start;
            selection.current = { start, end };
            changeText(
              text.slice(0, start) + source + text.slice(end),
              start + source.length,
            );
          }}
          onSelect={(event) => {
            const start = event.currentTarget.selectionStart ?? text.length;
            selection.current = {
              start,
              end: event.currentTarget.selectionEnd ?? start,
            };
            history.current.entries[history.current.index].caret = start;
            setCaret(start);
            syncScroll();
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            const key = event.key.toLowerCase();
            if (
              (event.ctrlKey || event.metaKey) &&
              !event.altKey &&
              (key === "z" || key === "y")
            ) {
              event.preventDefault();
              restoreHistory(key === "y" || event.shiftKey ? 1 : -1);
              return;
            }
            if (
              open &&
              event.key === "Enter" &&
              (loading || results.length === 0)
            )
              event.preventDefault();
          }}
        />
      </div>
      <ComboboxContent
        anchor={input}
        side="top"
        className="w-[min(24rem,var(--available-width))]"
      >
        <p className="px-3 pt-2 text-xs font-medium text-muted-foreground">
          {t("taskReferences.title")}
        </p>
        {loading && (
          <div
            role="status"
            className="flex items-center gap-2 p-3 text-sm text-muted-foreground"
          >
            <LoaderCircle className="size-4 animate-spin" />
            {t("taskReferences.loading")}
          </div>
        )}
        <ComboboxList>
          {!loading && results.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">
              {t("taskReferences.empty")}
            </p>
          )}
          {!loading &&
            results.map((task) => (
              <ComboboxItem key={task.taskId} value={task}>
                <ClipboardList
                  className="size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {task.title}
                </span>
              </ComboboxItem>
            ))}
        </ComboboxList>
        {status === "CanLoadMore" && !loading && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => loadMore(20)}
          >
            {t("taskReferences.more")}
          </Button>
        )}
      </ComboboxContent>
    </Autocomplete.Root>
  );
}
