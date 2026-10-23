import { fileTypeFromBuffer } from "file-type";

export async function readVerifiedUploadBody(
  request: Request,
  declaredSize: number,
  maxSize: number,
  contentType: string,
  {
    allowSvg = false,
    allowImageAliases = false,
  }: {
    allowSvg?: boolean;
    allowImageAliases?: boolean;
  } = {},
) {
  if (
    !Number.isSafeInteger(declaredSize) ||
    declaredSize <= 0 ||
    declaredSize > maxSize
  )
    return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > declaredSize || received > maxSize) {
      await reader.cancel();
      return null;
    }
    chunks.push(new Uint8Array(value));
  }
  if (received !== declaredSize) return null;
  const blob = new Blob(chunks, { type: contentType });
  // SVG has no magic-byte signature. Only image consumers opt into this format.
  if (allowSvg && contentType === "image/svg+xml") {
    const source = (await blob.text())
      .replace(/^\uFEFF/, "")
      .replace(/^\s*<\?xml\b[^?]*\?>/i, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim();
    return /^<svg(?:\s|>)/i.test(source) &&
      /(?:<\/svg>|\/>)[\s]*$/i.test(source)
      ? blob
      : null;
  }
  const detected = await fileTypeFromBuffer(
    await blob.slice(0, 4100).arrayBuffer(),
  );
  // Excalidraw also accepts JFIF, whose file signature is JPEG.
  const expectedType =
    allowImageAliases && contentType === "image/jfif"
      ? "image/jpeg"
      : contentType;
  return detected?.mime === expectedType ? blob : null;
}
