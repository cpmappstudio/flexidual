"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
// import { useQuery } from "convex/react";
// import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Expand } from "lucide-react";

interface InfoRowData {
    icon: ReactNode;
    label: string;
    value: ReactNode;
    extra?: ReactNode;
}

interface OverviewCardProps {
    title: string;
    description: string;
    imageStorageId?: Id<"_storage"> | undefined;
    imageUrl?: string | null;
    imageAlt: string;
    fallbackIcon: ReactNode;
    rows: InfoRowData[];
    className?: string;
}

export function OverviewCard({
    title,
    description,
    // imageStorageId,
    imageUrl,
    imageAlt,
    fallbackIcon,
    rows,
    className = "gap-2"
}: OverviewCardProps) {
    const [isImageExpanded, setIsImageExpanded] = useState(false);

    // // Get image URL from Convex storage if storageId is provided
    // const convexImageUrl = useQuery(
    //     api.entity.getImageUrl,
    //     imageStorageId ? { storageId: imageStorageId } : "skip"
    // );

    // Prefer provided imageUrl, then convexImageUrl from storage
    const imageSrc = imageUrl /*|| convexImageUrl */ || null;

    return (
        <>
            <Card className={`${className} overflow-hidden gap-0 w-full h-full`}>
                <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                            <CardTitle>{title}</CardTitle>
                            <CardDescription>{description}</CardDescription>
                        </div>
                        <div className="w-20 h-20 flex-shrink-0">
                            <AspectRatio ratio={1} className="bg-muted rounded-lg">
                                {imageSrc ? (
                                    <div
                                        className="relative h-full w-full group cursor-pointer"
                                        onClick={() => setIsImageExpanded(true)}
                                    >
                                        <Image
                                            src={imageSrc}
                                            alt={imageAlt}
                                            fill
                                            className="rounded-lg object-cover transition-all group-hover:brightness-75"
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Expand className="h-6 w-6 text-white" />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center rounded-lg bg-muted">
                                        {fallbackIcon}
                                    </div>
                                )}
                            </AspectRatio>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground">
                    {rows.map((row, index) => (
                        <div key={index}>
                            <InfoRow
                                icon={row.icon}
                                label={row.label}
                                value={row.value}
                                extra={row.extra}
                            />
                            {index < rows.length - 1 && <Separator className="my-3.5" />}
                        </div>
                    ))}
                </CardContent>
            </Card>

            {/* Image Expansion Dialog */}
            <Dialog open={isImageExpanded} onOpenChange={setIsImageExpanded}>
                <DialogContent className="max-w-5xl p-0 overflow-hidden border-0">
                    <DialogTitle className="sr-only">{imageAlt}</DialogTitle>
                    {imageSrc && (
                        <AspectRatio ratio={16 / 9} className="bg-muted">
                            <Image
                                src={imageSrc}
                                alt={imageAlt}
                                fill
                                className="object-cover"
                                priority
                                sizes="(max-width: 1280px) 100vw, 1280px"
                            />
                        </AspectRatio>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}

function InfoRow({ icon, label, value, extra }: { icon: ReactNode; label: string; value: ReactNode; extra?: ReactNode }) {
    return (
        <div className="flex items-start gap-3">
            <div className="mt-0.5">{icon}</div>
            <div className="flex-1">
                <p className="font-medium text-foreground">{label}</p>
                <div>{value}</div>
                {extra}
            </div>
        </div>
    );
}