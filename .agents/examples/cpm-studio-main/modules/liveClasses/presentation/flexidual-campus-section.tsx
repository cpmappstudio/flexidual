type FlexidualCampusSectionProps = {
  title: string;
  description: string;
  highlightsTitle: string;
  highlights: readonly string[];
};

export function FlexidualCampusSection({
  title,
  description,
  highlightsTitle,
  highlights,
}: FlexidualCampusSectionProps) {
  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-border/70 bg-card p-6 shadow-sm">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">
            {highlightsTitle}
          </h2>
          <ul className="grid gap-3 text-sm leading-6 text-muted-foreground md:grid-cols-2 xl:grid-cols-3">
            {highlights.map((highlight) => (
              <li
                key={highlight}
                className="rounded-2xl border border-dashed border-border/70 bg-background px-4 py-4"
              >
                {highlight}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
