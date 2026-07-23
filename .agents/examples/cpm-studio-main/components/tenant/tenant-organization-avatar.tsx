"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  getImageFallbackLabel,
  getOptionalImageSrc,
} from "@/lib/files/image";

export function TenantOrganizationAvatar({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl: string | null;
}) {
  const fallback = getImageFallbackLabel({
    name,
    fallback: "CP",
  });

  return (
    <Avatar className="size-20 rounded-3xl shadow-sm">
      <AvatarImage
        src={getOptionalImageSrc(imageUrl)}
        alt={name}
        className="rounded-3xl"
      />
      <AvatarFallback className="rounded-3xl text-lg font-semibold">
        {fallback}
      </AvatarFallback>
    </Avatar>
  );
}
