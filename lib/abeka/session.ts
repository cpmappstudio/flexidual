import { ProbeError } from "./progress";

export function validateCookieHeader(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 16_384 ||
    !value.trim() ||
    /[\x00-\x1F\x7F]/.test(value) ||
    !value
      .split(";")
      .every((part) =>
        /^ *[!#$%&'*+.^_`|~0-9A-Za-z-]+=[\x20-\x7E]*$/.test(part),
      )
  )
    throw new ProbeError(
      "Pega únicamente el valor del encabezado Cookie, no un comando ni un archivo HAR.",
    );
  return value.trim();
}

export async function readBoundedText(response: Response, maxBytes: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new ProbeError("EMPTY_RESPONSE");
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new ProbeError("RESPONSE_TOO_LARGE");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
