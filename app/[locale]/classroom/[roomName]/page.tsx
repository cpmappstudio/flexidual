import { use } from 'react';
import FlexiClassroom from '@/components/classroom/FlexiClassroom'; // Adjust path to where you saved the component
import { getTranslations } from 'next-intl/server';

interface ClassroomPageProps {
  params: Promise<{
    locale: string;
    roomName: string;
  }>;
}

export async function generateMetadata(props: ClassroomPageProps) {
  const params = await props.params;
  
  // Decodes "MATH-05-A" to readable text if needed, or just uses the ID
  return {
    title: `${decodeURIComponent(params.roomName)} | FlexiDual`,
  };
}

export default function ClassroomPage(props: ClassroomPageProps) {
  // In Next.js 15+, params is a Promise. We use `use` to unwrap it.
  // If you are on Next.js 14, you can await it or use it directly depending on config.
  // This pattern is safe for the latest versions.
  const params = use(props.params); 
  const roomName = decodeURIComponent(params.roomName);

  return (
    <main className="h-screen w-screen overflow-hidden bg-black">
      {/* This is the "Page Logic":
        1. It isolates the classroom environment (full screen).
        2. It passes the room ID from the URL to the LiveKit logic.
      */}
      <FlexiClassroom roomName={roomName} />
    </main>
  );
}