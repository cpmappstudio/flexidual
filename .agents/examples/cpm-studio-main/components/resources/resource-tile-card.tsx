import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { getInitials, getOptionalImageSrc } from "@/lib/files/image";
import { cn } from "@/lib/utils";

type ResourceTileCardProps = {
  name: string;
  imageUrl: string | null;
  imageFallback?: string;
  metaText?: string;
  isActive: boolean;
  statusLabel: string;
  goToAppLabel?: string;
};

export function ResourceTileCard({
  name,
  imageUrl,
  imageFallback = "RE",
  metaText,
  isActive,
  statusLabel,
  goToAppLabel,
}: ResourceTileCardProps) {
  const statusToneClass = isActive ? "bg-success" : "bg-muted-foreground/45";

  return (
    <Card className="gap-0 rounded-3xl border-border/70 bg-card pt-0 shadow-sm">
      <div
        className={cn("mx-auto h-0.5 w-3/5 rounded-b-full", statusToneClass)}
        aria-hidden="true"
      />
      <CardHeader className="flex min-h-24 flex-row items-start justify-between gap-4 px-5 pt-5">
        <Avatar className="size-8 rounded-md">
          <AvatarImage
            src={getOptionalImageSrc(imageUrl)}
            alt={name}
            className="rounded-md"
          />
          <AvatarFallback className="rounded-md text-xs font-semibold">
            {getInitials(name, imageFallback)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col items-end gap-1">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {statusLabel}
          </span>
          {metaText ? (
            <CardDescription
              className="max-w-40 truncate text-right font-mono text-xs"
              translate="no"
            >
              {metaText}
            </CardDescription>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex min-h-24 flex-col justify-end px-5 pb-3 pt-0">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold tracking-tight text-balance">
            {name}
          </h2>
          <div className="min-h-5">
            {goToAppLabel ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs font-medium text-foreground opacity-0 transition-all duration-100 motion-reduce:transition-none",
                  "translate-x-1 group-hover:translate-x-0 group-focus-within:translate-x-0",
                  "group-hover:opacity-100 group-focus-within:opacity-100",
                )}
              >
                {goToAppLabel}
                <span aria-hidden="true">→</span>
              </span>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
