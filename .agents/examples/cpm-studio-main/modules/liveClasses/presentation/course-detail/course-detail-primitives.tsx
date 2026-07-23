import { useTranslations } from "next-intl";

type HeroMetricProps = {
  label: string;
  value: string;
};

export function HeroMetric({ label, value }: HeroMetricProps) {
  return (
    <div className="rounded-2xl border border-white/55 bg-transparent px-4 py-3 shadow-sm backdrop-blur-md">
      <p className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
  detail?: string;
};

export function MetricCard({ label, value, detail }: MetricCardProps) {
  return (
    <div className="rounded-[1.25rem] border border-border/70 bg-background/90 px-4 py-4 shadow-sm">
      <p className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">
        {value}
      </p>
      {detail ? (
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  );
}

type LessonCardProps = {
  eyebrow: string;
  title: string;
  summary: string;
  objectives: readonly string[];
  footerLabel: string;
  footerValue: string;
};

export function LessonCard({
  eyebrow,
  title,
  summary,
  objectives,
  footerLabel,
  footerValue,
}: LessonCardProps) {
  const detailT = useTranslations("TenantLiveClasses.courses.detail");

  return (
    <div className="rounded-[1.25rem] border border-border/70 bg-background/90 p-5">
      <p className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {eyebrow}
      </p>
      <h3 className="mt-2 text-base font-semibold tracking-tight text-balance">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{summary}</p>

      <div className="mt-4">
        <p className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {detailT("content.objectives")}
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {objectives.map((objective) => (
            <div
              key={objective}
              className="flex items-start gap-2 rounded-[1rem] bg-muted/30 px-3 py-3"
            >
              <p className="text-sm leading-5 text-foreground/80">
                {objective}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-[1rem] border border-border/70 bg-card px-3 py-3">
        <p className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {footerLabel}
        </p>
        <p className="mt-2 text-sm leading-5 text-foreground/80">
          {footerValue}
        </p>
      </div>
    </div>
  );
}
