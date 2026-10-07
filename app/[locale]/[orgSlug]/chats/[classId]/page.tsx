import { CourseChatPage } from "@/components/chat/course-chat-page";
import type { Id } from "@/convex/_generated/dataModel";

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { classId } = await params;
  const { message } = await searchParams;
  return (
    <CourseChatPage
      classId={classId as Id<"classes">}
      selectedMessageId={message}
    />
  );
}
