import FlexiClassroom from '@/components/classroom/flexi-classroom';
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ExternalLink, MonitorPlay } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

interface ClassroomPageProps {
  params: Promise<{
    locale: string;
    roomName: string;
  }>;
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

export async function generateMetadata(props: ClassroomPageProps) {
  const params = await props.params;
  const roomName = decodeURIComponent(params.roomName);
  
  const parsed = parseRoomName(roomName);
  if (!parsed) {
    return { title: 'Classroom | FlexiDual' };
  }

  try {
    const [classData, lesson] = await Promise.all([
      fetchQuery(api.classes.get, { id: parsed.classId }),
      fetchQuery(api.lessons.get, { id: parsed.lessonId }),
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
  const params = await props.params; 
  const roomName = decodeURIComponent(params.roomName);

  // 1. Fetch the schedule to determine the type
  const schedule = await fetchQuery(api.schedule.getByRoomName, { roomName });
  const isIgnitia = schedule?.sessionType === "ignitia";
  const isAbeka = schedule?.sessionType === "abeka";
  const isVirtual = isIgnitia || isAbeka;

  // 2. IGNITIA RENDER STRATEGY
  if (isVirtual) {
    const ignitiaUrl = "https://centralpointefl.ignitiaschools.com/owsoo/login/auth";
    const abekaUrl = "https://login.abeka.com/abekab2c.onmicrosoft.com/b2c_1a_signin_legacy/oauth2/v2.0/authorize?client_id=39dfdf7d-fa0c-41dc-ae8f-a7f2ead1e645&response_type=id_token&scope=openid%20profile&state=OpenIdConnect.AuthenticationProperties%3DTmtO36sXdnSSdnF5m0ICSuO0TiIc6mkpqMBYNRvFoE8zqfGTp9mR1wLWNVXb-FznJRpV18nEgJh44lBGQ1L7HpfdPU57UCQ92L4AF9wxYSF52KxGZ9RFKs9tB5FETopSF_3i0I469pko6gDsKSSIGw&response_mode=form_post&nonce=639084289217533065.OTEyYzk1NjAtY2U1Mi00N2Y2LWE5OWItZWM3MTY2NDhhZmRmZDQ2NGI4ZTAtY2EzZC00NTMwLWI0ZjgtYmQyNGFhNTg5ZGE5&redirect_uri=https%3A%2F%2Fathome.abeka.com%2Flogin.aspx&x-client-SKU=ID_NET472&x-client-ver=6.29.0.0";
    
    const platformUrl = isAbeka ? abekaUrl : ignitiaUrl;
    const platformName = isAbeka ? "Abeka" : "Ignitia";
    const iconColor = isAbeka ? "text-blue-600 bg-blue-100" : "text-orange-600 bg-orange-100";
    
    return (
      <main className="w-full h-[calc(100vh-6rem)] rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white flex flex-col">
        {/* Header Bar */}
        <div className="h-14 bg-gray-50 border-b flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
             <div className={`p-2 rounded-full ${iconColor}`}>
               <MonitorPlay className="w-5 h-5" />
             </div>
             <div>
               <h1 className="font-bold text-gray-800">{platformName} Access</h1>
               <p className="text-xs text-muted-foreground">Teacher View</p>
             </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={platformUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />
              Open in New Tab
            </a>
          </Button>
        </div>

        {/* The Iframe */}
        <div className="flex-1 relative bg-gray-100">
           <iframe 
              src={platformUrl}
              className="w-full h-full border-0"
              allow="microphone; camera; fullscreen; display-capture"
              title={`${platformName} Teacher View`}
           />
        </div>
      </main>
    );
  }

  // 3. LIVEKIT RENDER STRATEGY (Standard)
  return (
    <main className="w-full h-[calc(100vh-6rem)] rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
      <FlexiClassroom roomName={roomName} />
    </main>
  );
}