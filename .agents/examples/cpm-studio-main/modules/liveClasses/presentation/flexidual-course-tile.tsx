import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getImageFallbackLabel, getOptionalImageSrc } from "@/lib/files/image";
import type {
  FlexidualCourseCard,
  FlexidualOrganizationIdentity,
} from "@/modules/liveClasses/lib/flexidual-course-types";

export function FlexidualCourseTile({
  course,
  curriculumLabel,
  organization,
}: {
  course: FlexidualCourseCard;
  curriculumLabel: string;
  organization: FlexidualOrganizationIdentity;
}) {
  const content = (
    <Card className="gap-0 overflow-hidden rounded-3xl border-border/70 bg-card pt-0 shadow-sm">
      <div
        className="mx-auto h-0.5 w-3/5 rounded-b-full bg-success"
        aria-hidden="true"
      />
      <CardHeader className="relative z-0 flex min-h-24 overflow-hidden px-5 pb-4 pt-5">
        <div
          aria-hidden="true"
          className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_18%_18%,color-mix(in_oklch,var(--primary)_24%,transparent),transparent_36%),radial-gradient(circle_at_82%_12%,color-mix(in_oklch,var(--muted-foreground)_14%,transparent),transparent_30%),linear-gradient(180deg,color-mix(in_oklch,var(--background)_82%,var(--primary)_6%),color-mix(in_oklch,var(--muted)_88%,var(--background)))]"
        />
        <div className="relative z-10 flex items-center gap-3">
          <Avatar className="size-12">
            <AvatarImage
              src={getOptionalImageSrc(organization.imageUrl)}
              alt={organization.name}
              className="rounded-md object-cover"
            />
            <AvatarFallback className="rounded-md text-xs font-semibold">
              {getImageFallbackLabel({
                name: organization.name,
                fallback: "OR",
              })}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold leading-5 tracking-tight text-pretty">
              {course.name}
            </h2>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-24 flex-col justify-end px-5 pb-3 pt-0">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {curriculumLabel}
          </span>
          <p className="text-sm font-medium leading-5 text-foreground text-pretty">
            {course.curriculumName}
          </p>
        </div>
      </CardContent>
    </Card>
  );

  if (course.href) {
    return (
      <Link
        href={course.href}
        className="group block h-full rounded-3xl touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="h-full rounded-3xl touch-manipulation">
      {content}
    </div>
  );
}
