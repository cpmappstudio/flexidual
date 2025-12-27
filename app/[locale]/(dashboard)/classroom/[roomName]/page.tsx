import { use } from 'react';
import FlexiClassroom from '@/components/classroom/flexi-classroom';
import { getTranslations } from 'next-intl/server';

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
    // CHANGE 1: Replaced w-screen/h-screen with w-full and a calculated height.
    // The Dashboard header is h-16 (4rem). The layout has ~1rem padding. 
    // h-[calc(100vh-6rem)] ensures it fits exactly in the content area without double scrollbars.
    <main className="w-full h-[calc(100vh-6rem)] rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
      <FlexiClassroom roomName={roomName} />
    </main>
  );
}