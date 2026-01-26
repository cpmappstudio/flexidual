import { use } from 'react';
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

  // 2. IGNITIA RENDER STRATEGY
  if (isIgnitia) {
    const ignitiaUrl = "https://ignitiumwa.ignitiaschools.com/owsoo/login/auth/true";
    
    return (
      <main className="w-full h-[calc(100vh-6rem)] rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white flex flex-col">
        {/* Header Bar */}
        <div className="h-14 bg-gray-50 border-b flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-orange-100 rounded-full text-orange-600">
               <MonitorPlay className="w-5 h-5" />
             </div>
             <div>
               <h1 className="font-bold text-gray-800">Ignitia Access</h1>
               <p className="text-xs text-muted-foreground">Teacher View</p>
             </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={ignitiaUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />
              Open in New Tab
            </a>
          </Button>
        </div>

        {/* The Iframe */}
        <div className="flex-1 relative bg-gray-100">
           <iframe 
              src={ignitiaUrl}
              className="w-full h-full border-0"
              allow="microphone; camera; fullscreen; display-capture"
              title="Ignitia Teacher View"
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