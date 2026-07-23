import {
  ChangelogTimeline,
  type ChangelogRelease,
} from "@/components/changelog/changelog-timeline";
import { PageContentContainer } from "@/components/layout/page-content-container";
import type { ChangelogVersion } from "@/lib/changelog/types";

type ChangelogPageProps = {
  locale: string;
  versions: ChangelogVersion[];
};

function formatReleaseDate(
  locale: string,
  isoDate: string | null,
  status: ChangelogVersion["status"],
) {
  if (!isoDate) {
    return status === "roadmap" ? "Estimated date pending" : "Ship date pending";
  }

  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(isoDate));

  return status === "roadmap" ? `Estimated ${date}` : date;
}

function getReleases({
  locale,
  versions,
}: ChangelogPageProps): ChangelogRelease[] {
  return versions.map((version) => ({
    version: version.version,
    title: version.title,
    description: version.description,
    date: formatReleaseDate(locale, version.date, version.status),
    status: version.status,
    groups: version.groups,
  }));
}

function ChangelogPageContent(props: ChangelogPageProps) {
  const releases = getReleases(props);
  const alignmentClassName = releases.length ? "items-start" : "items-center";

  return (
    <div className={`flex w-full flex-col ${alignmentClassName}`}>
      <ChangelogTimeline releases={releases} />
    </div>
  );
}

export function ChangelogPage({ locale, versions }: ChangelogPageProps) {
  return (
    <PageContentContainer className="max-w-4xl">
      <ChangelogPageContent locale={locale} versions={versions} />
    </PageContentContainer>
  );
}
