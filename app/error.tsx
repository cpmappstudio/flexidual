"use client";

import { useEffect } from "react";
import NextError from "next/error";
import { reportRuntimeError } from "@/lib/error-tracking";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportRuntimeError(error, {
      operation: "react.route",
      digest: error.digest,
    });
  }, [error]);
  return (
    <div className="relative">
      <NextError statusCode={0} />
      <button
        type="button"
        className="fixed bottom-12 left-1/2 -translate-x-1/2 rounded-lg border px-4 py-2 focus-visible:outline-2"
        onClick={reset}
      >
        Try again / Reintentar
      </button>
    </div>
  );
}
