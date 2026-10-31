"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { chatTextParts } from "@/lib/chat-attachments";
import { chatReferenceParts } from "@/lib/chat-references";
import { Link } from "@/i18n/navigation";
import { useOrgBasePath } from "@/hooks/use-org-base-path";

export function ChatMessageText({
  body,
  enabled,
  classId,
  availableTaskIds,
  plain = false,
}: {
  body: string;
  enabled: boolean;
  classId?: Id<"classes">;
  availableTaskIds?: Id<"courseTasks">[];
  plain?: boolean;
}) {
  if (plain) return <>{renderChatLinks(body, enabled)}</>;
  const availableTasks = new Set<string>(availableTaskIds);
  return chatReferenceParts(body).map((reference, index) =>
    reference.taskId ? (
      classId && availableTasks.has(reference.taskId) ? (
        <ChatTaskLink
          key={index}
          classId={classId}
          taskId={reference.taskId}
          title={reference.label!}
        />
      ) : (
        <span key={index}>{reference.label}</span>
      )
    ) : !enabled ? (
      <span key={index}>{reference.text}</span>
    ) : (
      <span key={index}>{renderChatLinks(reference.text, enabled)}</span>
    ),
  );
}

function renderChatLinks(body: string, enabled: boolean) {
  if (!enabled) return body;
  return chatTextParts(body).map((part, index) =>
    part.href ? (
      <span key={index}>
        <a
          href={part.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="underline underline-offset-2"
        >
          {part.label}
        </a>
        {part.suffix}
      </span>
    ) : (
      <span key={index}>{part.text}</span>
    ),
  );
}

function ChatTaskLink({
  classId,
  taskId,
  title,
}: {
  classId: Id<"classes">;
  taskId: string;
  title: string;
}) {
  const basePath = useOrgBasePath();
  return (
    <Link
      href={`${basePath}/classes/${classId}?task=${encodeURIComponent(taskId)}`}
      className="font-medium underline underline-offset-2"
    >
      {title}
    </Link>
  );
}
