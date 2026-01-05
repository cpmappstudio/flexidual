import { use } from 'react';
import FlexiClassroom from '@/components/classroom/flexi-classroom';

interface ClassroomPageProps {
  params: Promise<{
    locale: string;
    roomName: string;
  }>;
}

export async function generateMetadata(props: ClassroomPageProps) {
  const params = await props.params;
  return {
    title: `${decodeURIComponent(params.roomName)} | FlexiDual`,
  };
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