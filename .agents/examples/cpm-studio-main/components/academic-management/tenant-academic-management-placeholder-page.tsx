import type { LucideIcon } from "lucide-react";

export function TenantAcademicManagementPlaceholderPage({
  icon: Icon,
  title,
}: {
  icon: LucideIcon;
  title: string;
}) {
  return (
    <section className="grid min-h-64 place-items-center p-10">
      <h1 className="sr-only">{title}</h1>
      <Icon aria-hidden="true" className="size-12 text-muted-foreground" />
    </section>
  );
}
