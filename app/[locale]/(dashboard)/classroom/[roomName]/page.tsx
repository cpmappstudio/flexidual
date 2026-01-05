import { use } from 'react';
import FlexiClassroom from '@/components/classroom/flexi-classroom';
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
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

export default function ClassroomPage(props: ClassroomPageProps) {
  const params = use(props.params); 
  const roomName = decodeURIComponent(params.roomName);

  return (
    <main className="w-full h-[calc(100vh-6rem)] rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
      <FlexiClassroom roomName={roomName} />
    </main>
  );
}