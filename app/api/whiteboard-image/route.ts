import { NextResponse } from "next/server";

/** Allowlist: only proxy images from Convex storage. Prevents SSRF abuse. */
function isAllowedUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return (
      protocol === "https:" &&
      (hostname.endsWith(".convex.cloud") || hostname === "convex.cloud")
    );
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  if (!isAllowedUrl(url)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      throw new Error(`Upstream responded with ${upstream.status}`);
    }

    const blob = await upstream.blob();
    const headers = new Headers();
    headers.set(
      "Content-Type",
      upstream.headers.get("Content-Type") ?? "application/octet-stream",
    );
    // Assets are content-addressed (Convex storageId) — safe to cache indefinitely
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("Access-Control-Allow-Origin", "*");

    return new NextResponse(blob, { status: 200, headers });
  } catch (error) {
    console.error("[whiteboard-image proxy]", error);
    return new NextResponse("Failed to fetch image from storage", { status: 502 });
  }
}
