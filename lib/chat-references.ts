export type ChatTextReference = {
  text: string;
  taskId?: string;
  label?: string;
};

export function taskChatReference(taskId: string, title: string) {
  return `[${title.replace(/[\\\[\]]/g, "\\$&")}](task:${taskId})`;
}

export function chatReferenceParts(body: string): ChatTextReference[] {
  const pattern = /\[((?:\\.|[^\]\\])*)\]\(task:([a-z0-9_-]+)\)/gi;
  const parts: ChatTextReference[] = [];
  let end = 0;
  for (const match of body.matchAll(pattern)) {
    if (match.index > end) parts.push({ text: body.slice(end, match.index) });
    parts.push({
      text: match[0],
      taskId: match[2],
      label: match[1].replace(/\\([\\\[\]])/g, "$1"),
    });
    end = match.index + match[0].length;
  }
  if (end < body.length) parts.push({ text: body.slice(end) });
  return parts;
}

export function chatSlashQuery(body: string, caret: number) {
  const match = /(?:^|\s)\/([^\s/]*(?: [^\s/]*)*)$/.exec(body.slice(0, caret));
  if (!match) return null;
  const start = caret - match[1].length - 1;
  let offset = 0;
  for (const part of chatReferenceParts(body)) {
    if (part.taskId && start >= offset && start < offset + part.text.length)
      return null;
    offset += part.text.length;
  }
  return { start, end: caret, search: match[1] };
}
