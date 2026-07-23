import { Skeleton } from "@/components/ui/skeleton";

export default function LocaleLoading() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted p-6 md:p-10">
      <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-sm">
        <div className="space-y-4">
          <Skeleton className="mx-auto h-7 w-40" />
          <Skeleton className="mx-auto h-4 w-64" />
        </div>
        <div className="mt-8 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>
    </main>
  );
}
