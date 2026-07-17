"use client";

import Image from "next/image";
import { useRouter } from "@/i18n/navigation";
import { useClerk } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GridPattern } from "@/components/patterns/grid-pattern";
import { ROUTES } from "@/lib/navigation/routes";

interface OrganizationCardProps {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string;
}

export function OrganizationCard({
  id,
  name,
  slug,
  imageUrl,
}: OrganizationCardProps) {
  const router = useRouter();
  const { setActive } = useClerk();

  const handleClick = () => {
    setActive({ organization: id }).then(() => {
      router.push(ROUTES.org.root(slug));
    });
  };

  return (
    <button type="button" onClick={handleClick} className="w-full text-left">
      <Card className="group p-3 h-full hover:border-primary/50 border transition-colors cursor-pointer relative overflow-hidden">
        <GridPattern />
        <CardHeader className="px-1 relative z-10">
          <div className="flex items-center justify-between">
            {imageUrl && (
              <Image
                src={imageUrl}
                alt={name}
                width={0}
                height={0}
                className="size-10 object-cover rounded-lg"
              />
            )}
            <div className="text-xs text-muted-foreground">/{slug}</div>
          </div>
        </CardHeader>
        <CardContent className="px-1 relative z-10">
          <CardTitle>{name}</CardTitle>
        </CardContent>
      </Card>
    </button>
  );
}
