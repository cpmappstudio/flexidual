import type { ReactNode } from "react";
import Image from "next/image";

interface CpcaHeaderProps {
  title: ReactNode;
  subtitle: ReactNode;
  logoUrl?: string;
  media?: ReactNode;
  action?: ReactNode;
}

const CpcaHeader = ({
  title,
  subtitle,
  logoUrl,
  media,
  action,
}: CpcaHeaderProps) => {
  return (
    <header className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex shrink-0 items-center gap-4">
        {media ? (
          media
        ) : (
          <div className="relative h-15 w-15 shrink-0 overflow-hidden rounded-lg bg-muted/30">
            <Image
              src={logoUrl || "/cpca-logo.png"}
              alt="Organization Logo"
              fill
              className="object-fit"
            />
          </div>
        )}
        <div className="border-l-2 border-muted-foreground pl-4">
          <div className="text-lg font-semibold">{title}</div>
          <div className="text-sm">{subtitle}</div>
        </div>
      </div>
      {action ? (
        <div className="w-full min-w-0 sm:flex sm:flex-1 sm:justify-end">
          {action}
        </div>
      ) : null}
    </header>
  );
};
export default CpcaHeader;
