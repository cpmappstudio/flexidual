import { Skeleton } from "@/components/ui/skeleton";

export function OrganizationSwitcherSkeleton() {
  return (
    <div className="flex items-center space-x-3 px-2 py-1">
      <Skeleton className="size-5 rounded-sm  lg:bg-white lg:ring-1 lg:ring-zinc-950/5 dark:lg:bg-zinc-900 dark:lg:ring-white/10" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-[170px] lg:bg-white lg:ring-1 lg:ring-zinc-950/5 dark:lg:bg-zinc-900 dark:lg:ring-white/10" />
      </div>
    </div>
  );
}
