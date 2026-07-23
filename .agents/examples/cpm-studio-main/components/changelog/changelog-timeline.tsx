import { ChangelogReleaseContent } from "@/components/changelog/changelog-release-content";
import { Badge } from "@/components/ui/badge";
import type {
  ChangelogGroup,
  ChangelogStatus,
} from "@/lib/changelog/types";
import { cn } from "@/lib/utils";

export type ChangelogRelease = {
  version: string;
  title: string;
  description: string | null;
  date: string;
  status: ChangelogStatus;
  groups: ChangelogGroup[];
};

type ChangelogTimelineProps = {
  releases: ChangelogRelease[];
};

export function ChangelogTimeline({ releases }: ChangelogTimelineProps) {
  return (
    <>
      <div className="mb-8 flex w-full flex-col gap-4 text-center md:mb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          Changelog Origin Update
        </h1>
        <p className="text-xl text-muted-foreground">
          Discover what&apos;s been added, changed, fixed, improved, and updated
          in this release.
        </p>
      </div>
      {releases.length ? (
        releases.map((release, index) => (
          <div
            key={release.version}
            id={String(index + 1)}
            className="relative flex scroll-mt-18 justify-end gap-2"
          >
            <div className="sticky top-19 flex w-36 flex-col items-end gap-2 self-start pb-4 max-md:hidden">
              <Badge
                className={cn(
                  "flex size-6 w-auto justify-end rounded-sm text-sm font-medium",
                  release.status === "roadmap" && "opacity-55",
                )}
              >
                {release.version}
              </Badge>
              <div className="text-right text-sm font-medium text-muted-foreground">
                {release.date}
              </div>
            </div>
            <div className="flex flex-col items-center">
              <div className="sticky top-19 flex size-6 items-center justify-center max-sm:top-5">
                <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-primary/20">
                  <span className="size-3 rounded-full bg-primary" />
                </span>
              </div>
              <span className="-mt-2.5 w-px flex-1 border" />
            </div>
            <div className="flex flex-1 flex-col gap-4 pb-11 pl-3 md:pl-6 lg:pl-9">
              <div className="flex flex-col gap-2 md:hidden">
                <Badge
                  className={cn(
                    "flex rounded-sm font-medium",
                    release.status === "roadmap" && "opacity-55",
                  )}
                >
                  {release.version}
                </Badge>
                <div className="font-medium">{release.date}</div>
              </div>
              <ChangelogReleaseContent
                title={release.title}
                description={release.description}
                groups={release.groups}
              />
            </div>
          </div>
        ))
      ) : (
        <div className="flex w-full justify-center">
          <div className="w-full max-w-sm rounded-xl border bg-card px-6 py-8 text-center text-sm text-muted-foreground">
            No changelog milestones are available yet.
          </div>
        </div>
      )}
    </>
  );
}
