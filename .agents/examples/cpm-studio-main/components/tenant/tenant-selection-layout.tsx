import type { CSSProperties, ReactNode } from "react";
import { TenantOrganizationAvatar } from "@/components/tenant/tenant-organization-avatar";
import { cn } from "@/lib/utils";

const CENTERED_SELECTION_GRID_STYLE: CSSProperties = {
  gridTemplateColumns:
    "repeat(auto-fit, minmax(min(100%, 12.75rem), 12.75rem))",
};

export function TenantSelectionLayout({
  children,
  className,
  footer,
  gridClassName,
  organizationImageUrl,
  organizationName,
  title,
  titleClassName,
}: {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  gridClassName?: string;
  organizationImageUrl: string | null;
  organizationName: string;
  title: string;
  titleClassName?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <section>
        <div className="flex flex-col items-center justify-center">
          <TenantOrganizationAvatar
            name={organizationName}
            imageUrl={organizationImageUrl}
          />
          <h1
            className={cn(
              "mt-3 max-w-3xl text-balance text-center text-3xl font-semibold tracking-tight text-primary md:text-5xl",
              titleClassName,
            )}
          >
            {title}
          </h1>
        </div>

        <div
          className={cn(
            "mt-8 grid justify-center gap-4",
            gridClassName,
          )}
          style={CENTERED_SELECTION_GRID_STYLE}
        >
          {children}
        </div>
      </section>

      {footer}
    </div>
  );
}
