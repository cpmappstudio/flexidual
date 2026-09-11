export const MAX_CHAT_ATTACHMENTS = 3;
export const MAX_CHAT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_CHAT_MESSAGE_BYTES = 20 * 1024 * 1024;
export const CHAT_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

export function isValidChatFile(file: {
  name: string;
  size: number;
  type: string;
}) {
  const extensions: Record<string, string[]> = {
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"],
    "application/pdf": ["pdf"],
  };
  return (
    Number.isSafeInteger(file.size) &&
    file.size > 0 &&
    file.size <= MAX_CHAT_FILE_BYTES &&
    file.name.trim().length > 0 &&
    file.name.length <= 180 &&
    !/[\x00-\x1f\x7f/\\]/.test(file.name) &&
    (extensions[file.type]?.includes(
      file.name.split(".").pop()?.toLowerCase() ?? "",
    ) ??
      false)
  );
}

// ponytail: explicit web URLs only; no remote previews or content crawling.
export function chatTextParts(body: string) {
  return body.split(/((?:https?:\/\/|www\.)[^\s<>]+)/gi).map((text) => {
    if (!/^(?:https?:\/\/|www\.)/i.test(text)) return { text };
    const candidate = text.replace(/[.,!?;:)]+$/, "");
    try {
      const url = new URL(
        /^www\./i.test(candidate) ? `https://${candidate}` : candidate,
      );
      if (!url.hostname || url.username || url.password) return { text };
      return {
        text,
        href: url.href,
        label: candidate,
        suffix: text.slice(candidate.length),
      };
    } catch {
      return { text };
    }
  });
}

export function containsChatLink(body: string) {
  return /(?:https?:\/\/|www\.)/i.test(body);
}
