import type { ReactNode } from "react";

export function PreviewCard({
  title,
  media,
  leading,
  children,
}: {
  title: string;
  media: ReactNode;
  leading?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0" data-slot="preview-card">
      <div
        className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-sidebar-border bg-sidebar"
        data-slot="preview-card-media"
      >
        {media}
      </div>
      <div className="mt-3 flex min-w-0 items-start gap-2.5">
        {leading}
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug text-foreground">
            {title}
          </h3>
          {children}
        </div>
      </div>
    </div>
  );
}
