import { Skeleton } from "@/components/ui/skeleton";

interface TableSkeletonProps {
    rows?: number;
}

export function TableSkeleton({ rows = 5 }: TableSkeletonProps) {
    return (
        <div className="w-full">
            <div className="flex items-center gap-2 pb-4">
                <Skeleton className="h-9 w-full" />
                <div className="ml-auto flex items-center gap-2">
                    <Skeleton className="h-9 w-9" />
                    <Skeleton className="h-9 w-9" />
                    <Skeleton className="h-9 w-9" />
                </div>
            </div>

            <div className="rounded-md border">
                <div className="bg-muted p-5 border-b" />

                <div className="divide-y">
                    {Array.from({ length: rows }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4 p-3">
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="h-5 w-24" />
                            <Skeleton className="h-5 w-12 ml-auto" />
                            <Skeleton className="h-6 w-16 rounded-md" />
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex items-center justify-end space-x-2 py-4">
                <Skeleton className="h-4 w-32" />
                <div className="ml-auto space-x-2">
                    <Skeleton className="h-9 w-9 inline-block" />
                    <Skeleton className="h-9 w-9 inline-block" />
                </div>
            </div>
        </div>
    );
}
