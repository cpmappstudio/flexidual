import FlexiClassroom from "@/components/classroom/flexi-classroom-client";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ExternalLink, MonitorPlay } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth } from "@clerk/nextjs/server";
import { getRouteRole } from "@/lib/rbac";
import { getExternalClassPlatform } from "@/lib/class-session";

interface ClassroomPageProps {
  params: Promise<{
    locale: string;
    orgSlug: string;
    roomName: string;
  }>;
  searchParams: Promise<{ companion?: string }>;
}

async function getConvexToken() {
  const { getToken } = await auth();
  return (await getToken({ template: "convex" })) ?? undefined;
}

export async function generateMetadata(props: ClassroomPageProps) {
  const params = await props.params;
  const roomName = decodeURIComponent(params.roomName);

  try {
    const token = await getConvexToken();
    const schedule = await fetchQuery(
      api.schedule.getByRoomName,
      { roomName },
      { token },
    );
    const classData = schedule
      ? await fetchQuery(api.classes.get, { id: schedule.classId }, { token })
      : null;

    return { title: classData ? `${classData.name} | FlexiDual` : "Classroom" };
  } catch {
    return { title: "Classroom | FlexiDual" };
  }
}

export default async function ClassroomPage(props: ClassroomPageProps) {
  const t = await getTranslations("classroom");
  const params = await props.params;
  const searchParams = await props.searchParams;
  const roomName = decodeURIComponent(params.roomName);
  const isCompanion = searchParams.companion === "true";
  const { getToken, sessionClaims } = await auth();
  const token = (await getToken({ template: "convex" })) ?? undefined;
  const isStudent = getRouteRole(sessionClaims, params.orgSlug) === "student";

  // 1. Fetch the schedule to determine the type
  const schedule = await fetchQuery(
    api.schedule.getByRoomName,
    { roomName },
    { token },
  );
  const externalPlatform = getExternalClassPlatform(schedule?.sessionType);

  if (externalPlatform) {
    const { name: platformName, url: platformUrl } = externalPlatform;

    return (
      <main
        data-classroom-layout
        className="flex h-full min-h-0 w-full items-center justify-center rounded-2xl border border-border bg-card p-6 text-center shadow-sm"
      >
        <div className="flex max-w-md flex-col items-center">
          <div className="mb-6 flex size-20 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
            <MonitorPlay className="size-10 text-primary" aria-hidden="true" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-card-foreground">
            {t("platformAccess", { platform: platformName })}
          </h1>
          <p className="mb-8 text-muted-foreground">
            {t("externalPlatformAccessMessage", { platform: platformName })}
          </p>
          <Button size="lg" className="px-8" asChild>
            <a href={platformUrl} target="_blank" rel="noopener noreferrer">
              {t("goToPlatform", { platform: platformName })}
              <ExternalLink className="ml-2 size-4" aria-hidden="true" />
            </a>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main
      data-classroom-layout
      className="h-full min-h-0 w-full overflow-hidden"
    >
      <FlexiClassroom
        roomName={roomName}
        isStudentView={isStudent}
        isCompanion={isCompanion}
      />
    </main>
  );
}
