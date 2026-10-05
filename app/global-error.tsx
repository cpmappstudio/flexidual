"use client";

import { useEffect } from "react";
import NextError from "next/error";
import { reportRuntimeError } from "@/lib/error-tracking";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    reportRuntimeError(error, {
      operation: "react.global",
      digest: error.digest,
    });
  }, [error]);
  return (
    <html lang="en">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
