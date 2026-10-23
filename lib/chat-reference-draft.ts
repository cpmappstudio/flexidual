import { chatReferenceParts, chatSlashQuery } from "./chat-references";

export function chatDraftParts(body: string) {
  let start = 0;
  return chatReferenceParts(body).map((part) => {
    const text = part.taskId ? part.label! : part.text;
    const result = {
      ...part,
      text,
      source: part.text,
      start,
      end: start + text.length,
    };
    start = result.end;
    return result;
  });
}

export function chatDraftText(body: string) {
  return chatDraftParts(body)
    .map((part) => part.text)
    .join("");
}

export function chatDraftSlashQuery(body: string, caret: number) {
  const parts = chatDraftParts(body);
  const query = chatSlashQuery(parts.map((part) => part.text).join(""), caret);
  if (
    !query ||
    parts.some(
      (part) => part.taskId && query.start < part.end && query.end > part.start,
    )
  )
    return null;
  const sourceOffset = (offset: number) =>
    offset +
    parts
      .filter((part) => part.end <= offset)
      .reduce(
        (difference, part) =>
          difference + part.source.length - part.text.length,
        0,
      );
  return {
    ...query,
    start: sourceOffset(query.start),
    end: sourceOffset(query.end),
  };
}

// Only references outside the edited range survive; editing a label turns it into ordinary text.
export function updateChatDraft(
  body: string,
  next: string,
  selection: { start: number; end: number },
  caret: number,
) {
  const parts = chatDraftParts(body);
  const previous = parts.map((part) => part.text).join("");
  if (previous === next) return body;
  let start = 0;
  while (
    start < Math.min(selection.start, caret, previous.length, next.length) &&
    previous[start] === next[start]
  )
    start++;
  let end = previous.length;
  let nextEnd = next.length;
  while (
    end > Math.max(start, selection.end) &&
    nextEnd > Math.max(start, caret) &&
    previous[end - 1] === next[nextEnd - 1]
  ) {
    end--;
    nextEnd--;
  }
  let result = next;
  for (const part of [...parts].reverse()) {
    if (!part.taskId || (part.end > start && part.start < end)) continue;
    // An insertion inside the label also invalidates the reference.
    if (start === end && part.start < start && start < part.end) continue;
    const shift = part.start >= end ? nextEnd - end : 0;
    result =
      result.slice(0, part.start + shift) +
      part.source +
      result.slice(part.end + shift);
  }
  return result;
}

export function sliceChatDraft(body: string, start: number, end: number) {
  return chatDraftParts(body)
    .map((part) => {
      if (part.end <= start || part.start >= end) return "";
      if (part.taskId && start <= part.start && end >= part.end)
        return part.source;
      return part.text.slice(Math.max(0, start - part.start), end - part.start);
    })
    .join("");
}
