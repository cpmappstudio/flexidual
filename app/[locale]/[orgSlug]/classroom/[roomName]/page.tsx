import FlexiClassroom from '@/components/classroom/flexi-classroom-client';
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ExternalLink, MonitorPlay } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { getTranslations } from "next-intl/server";
import { auth } from "@clerk/nextjs/server";

interface ClassroomPageProps {
  params: Promise<{
    locale: string;
    roomName: string;
  }>;
  searchParams: Promise<{ companion?: string }>;
}

// Helper to extract IDs from room name
function parseRoomName(roomName: string): { classId: Id<"classes">; lessonId: Id<"lessons"> } | null {
  const match = roomName.match(/class-([a-z0-9]+)-lesson-([a-z0-9]+)/);
  if (match) {
    return {
      classId: match[1] as Id<"classes">,
      lessonId: match[2] as Id<"lessons">,
    };
  }
  return null;
}

async function getConvexToken() {
  const { getToken } = await auth();
  return (await getToken({ template: "convex" })) ?? undefined;
}

export async function generateMetadata(props: ClassroomPageProps) {
  const params = await props.params;
  const roomName = decodeURIComponent(params.roomName);
  
  const parsed = parseRoomName(roomName);
  if (!parsed) {
    return { title: 'Classroom | FlexiDual' };
  }

  try {
    const token = await getConvexToken();
    const [classData, lesson] = await Promise.all([
      fetchQuery(api.classes.get, { id: parsed.classId }, { token }),
      fetchQuery(api.lessons.get, { id: parsed.lessonId }, { token }),
    ]);

    if (classData && lesson) {
      return { title: `${classData.name} - ${lesson.title} | FlexiDual` };
    }
    
    return { title: classData?.name || lesson?.title || 'Classroom' };
  } catch {
    return { title: 'Classroom | FlexiDual' };
  }
}

export default async function ClassroomPage(props: ClassroomPageProps) {
  const t = await getTranslations('classroom');
  const params = await props.params;
  const searchParams = await props.searchParams;
  const roomName = decodeURIComponent(params.roomName);
  const isCompanion = searchParams.companion === "true";
  const token = await getConvexToken();

  // 1. Fetch the schedule to determine the type
  const schedule = await fetchQuery(
    api.schedule.getByRoomName,
    { roomName },
    { token },
  );
  const isIgnitia = schedule?.sessionType === "ignitia";
  const isAbeka = schedule?.sessionType === "abeka";
  const isVirtual = isIgnitia || isAbeka;

  // 2. IGNITIA RENDER STRATEGY
  if (isVirtual) {
    const ignitiaUrl = "https://centralpointefl.ignitiaschools.com/owsoo/login/auth";
    const abekaUrl = "https://login.abeka.com/abekab2c.onmicrosoft.com/b2c_1a_signin_legacy/oauth2/v2.0/authorize?client_id=39dfdf7d-fa0c-41dc-ae8f-a7f2ead1e645&response_type=id_token&scope=openid%20profile&state=OpenIdConnect.AuthenticationProperties%3DTmtO36sXdnSSdnF5m0ICSuO0TiIc6mkpqMBYNRvFoE8zqfGTp9mR1wLWNVXb-FznJRpV18nEgJh44lBGQ1L7HpfdPU57UCQ92L4AF9wxYSF52KxGZ9RFKs9tB5FETopSF_3i0I469pko6gDsKSSIGw&response_mode=form_post&nonce=639084289217533065.OTEyYzk1NjAtY2U1Mi00N2Y2LWE5OWItZWM3MTY2NDhhZmRmZDQ2NGI4ZTAtY2EzZC00NTMwLWI0ZjgtYmQyNGFhNTg5ZGE5&redirect_uri=https%3A%2F%2Fathome.abeka.com%2Flogin.aspx&x-client-SKU=ID_NET472&x-client-ver=6.29.0.0";
    
    const platformUrl = isAbeka ? abekaUrl : ignitiaUrl;
    const platformName = isAbeka ? "Abeka" : "Ignitia";
    const iconColor = isAbeka ? "text-info bg-info/10" : "text-secondary bg-secondary/10";
    
    return (
      <main className="flex h-[calc(100svh-var(--header-height)-2rem)] min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:h-[calc(100svh-var(--header-height)-3rem)]">
        {/* Header Bar */}
        <div className="h-14 bg-muted border-b flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
             <div className={`p-2 rounded-full ${iconColor}`}>
               <MonitorPlay className="w-5 h-5" />
             </div>
             <div>
               <h1 className="font-bold text-card-foreground">{t('platformAccess', { platform: platformName })}</h1>
               <p className="text-xs text-muted-foreground">{t('teacherView')}</p>
             </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={platformUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />
              {t('openInNewTab')}
            </a>
          </Button>
        </div>

        {/* The Content Area: Iframe OR External Launch */}
        <div className="flex-1 relative bg-muted flex flex-col">
          {isAbeka ? (
            <div className="flex-1 w-full h-full flex flex-col items-center justify-center bg-card p-6 text-center">
              <div className="w-20 h-20 bg-info/10 rounded-full flex items-center justify-center mb-6 border border-info/20">
                <ExternalLink className="w-10 h-10 text-info" />
              </div>
              <h3 className="text-2xl font-bold text-card-foreground mb-2">
                {t('abekaTeacherAccess')}
              </h3>
              <p className="text-muted-foreground mb-8 max-w-md">
                {t('abekaTeacherSecurityMsg')}
              </p>
              <Button size="lg" className="px-8" asChild>
                <a href={platformUrl} target="_blank" rel="noopener noreferrer">
                  {t('openAbekaPortal')}
                  <ExternalLink className="w-4 h-4 ml-2" />
                </a>
              </Button>
            </div>
          ) : (
             <iframe 
                src={platformUrl}
                className="w-full h-full border-0"
                allow="microphone; camera; fullscreen; display-capture"
                title={`${platformName} Teacher View`}
             />
          )}
        </div>
      </main>
    );
  }

  // 3. LIVEKIT RENDER STRATEGY (Standard)
  return (
    <main className="h-[calc(100svh-var(--header-height)-2rem)] min-h-0 w-full overflow-hidden md:h-[calc(100svh-var(--header-height)-3rem)]">
      <FlexiClassroom roomName={roomName} isCompanion={isCompanion} />
    </main>
  );
}
