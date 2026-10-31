/**
 * Compress a data URL image via an off-screen Canvas before upload.
 * - Non-raster types (SVG, unknown) are returned unchanged.
 * - Transparency is preserved only when the original is PNG; otherwise JPEG is used.
 * Operates entirely in the browser — no external libraries needed.
 */
export async function compressWhiteboardImage(
  dataUrl: string,
  mimeType: string,
  maxDimension = 1920,
  quality = 0.82,
): Promise<{ blob: Blob; mimeType: string }> {
  const raster =
    mimeType === "image/png" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/webp";
  if (!raster) {
    const res = await fetch(dataUrl);
    return { blob: await res.blob(), mimeType };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas 2d unavailable"));
        return;
      }

      // Fill white background for JPEG (which has no alpha channel)
      const outputType = mimeType === "image/png" ? "image/png" : "image/jpeg";
      if (outputType === "image/jpeg") {
        ctx.fillStyle = getComputedStyle(document.documentElement)
          .getPropertyValue("--whiteboard")
          .trim();
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve({ blob, mimeType: outputType });
          else reject(new Error("canvas.toBlob returned null"));
        },
        outputType,
        quality,
      );
    };
    img.onerror = () => reject(new Error("image load failed"));
    img.src = dataUrl;
  });
}

export async function uploadWhiteboardImage(
  blob: Blob,
  mimeType: string,
  token: string,
  params: Record<string, string>,
): Promise<import("./whiteboard-draft-storage").WhiteboardFileRefs[string]> {
  const site =
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
    process.env.NEXT_PUBLIC_CONVEX_URL?.replace(
      /\.convex\.cloud$/,
      ".convex.site",
    );
  if (!site) throw new Error("WHITEBOARD_UPLOAD_UNAVAILABLE");
  const url = new URL("/whiteboard-files", site);
  url.search = new URLSearchParams(params).toString();
  const response = await fetch(url, {
    method: "POST",
    body: blob,
    headers: {
      "Content-Type": mimeType,
      "X-File-Size": String(blob.size),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "Whiteboard image upload failed",
    );
  }
  return await response.json();
}
