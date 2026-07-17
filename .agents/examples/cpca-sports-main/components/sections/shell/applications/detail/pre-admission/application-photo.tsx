"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Image from "next/image";
import { Skeleton } from "@/components/ui/skeleton";
import { AspectRatio } from "@/components/ui/aspect-ratio";

interface ApplicationPhotoProps {
  storageId: Id<"_storage">;
  applicationId: Id<"applications">;
  alt?: string;
  size?: "sm" | "md";
}

export function ApplicationPhoto({
  storageId,
  applicationId,
  alt = "Applicant photo",
  size = "md",
}: ApplicationPhotoProps) {
  const photoUrl = useQuery(api.files.getUrl, { storageId, applicationId });

  const sizeClasses = size === "sm" ? "w-10 h-10" : "w-20 h-20";

  if (photoUrl === undefined) {
    return <Skeleton className={`${sizeClasses} rounded-md`} />;
  }

  if (!photoUrl) {
    return (
      <div
        className={`${sizeClasses} bg-muted rounded-md flex items-center justify-center border`}
      >
        <span className="text-muted-foreground text-sm">No photo</span>
      </div>
    );
  }

  return (
    <div className={sizeClasses}>
      <AspectRatio ratio={1} className="rounded-md overflow-hidden border">
        <Image
          src={photoUrl}
          alt={alt}
          fill
          sizes={size === "sm" ? "40px" : "80px"}
          unoptimized
          className="object-contain"
        />
      </AspectRatio>
    </div>
  );
}
