import { fileTypeFromBuffer } from "file-type";

export async function readVerifiedUploadBody(
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
  const detected = await fileTypeFromBuffer(
    await blob.slice(0, 4100).arrayBuffer(),
  );
  return detected?.mime === contentType ? blob : null;
}
