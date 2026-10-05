import { fileTypeFromBuffer } from "file-type";
import { unzipSync } from "fflate";

const OFFICE_MAIN_PARTS: Record<string, { path: string; contentType: string }> =
  {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      path: "word/document.xml",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    },
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      {
        path: "ppt/presentation.xml",
        contentType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
      },
  };

function isOfficePackage(bytes: Uint8Array, contentType: string) {
  const mainPart = OFFICE_MAIN_PARTS[contentType];
  if (
    !mainPart ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    bytes[2] !== 0x03 ||
    bytes[3] !== 0x04
  )
    return false;

  let entryCount = 0;
  let mainPartCount = 0;
  let contentTypesCount = 0;
  let hasMacros = false;
  try {
    const files = unzipSync(bytes, {
      filter: ({ name, originalSize }) => {
        entryCount += 1;
        if (name === mainPart.path) mainPartCount += 1;
        if (name === "[Content_Types].xml") contentTypesCount += 1;
        if (name.toLowerCase().endsWith("vbaproject.bin")) hasMacros = true;
        return (
          name === "[Content_Types].xml" &&
          contentTypesCount === 1 &&
          originalSize <= 128 * 1024
        );
      },
    });
    if (
      entryCount > 4096 ||
      mainPartCount !== 1 ||
      contentTypesCount !== 1 ||
      hasMacros ||
      !files["[Content_Types].xml"] ||
      files["[Content_Types].xml"].length > 128 * 1024
    )
      return false;

    const xml = new TextDecoder("utf-8", { fatal: true })
      .decode(files["[Content_Types].xml"])
      .replace(/<!--[\s\S]*?-->/g, "");
    if (!/<Types\b/.test(xml)) return false;
    for (const [tag] of xml.matchAll(/<Override\b[^>]*>/g)) {
      const path = tag.match(/\bPartName=(["'])(.*?)\1/)?.[2];
      const mime = tag.match(/\bContentType=(["'])(.*?)\1/)?.[2];
      if (path === `/${mainPart.path}` && mime === mainPart.contentType)
        return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function readCourseTaskUploadBody(
  request: Request,
  declaredSize: number,
  maxSize: number,
  contentType: string,
) {
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
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (contentType in OFFICE_MAIN_PARTS)
    return isOfficePackage(bytes, contentType) ? blob : null;
  const detected = await fileTypeFromBuffer(bytes);
  return detected?.mime === contentType ? blob : null;
}
