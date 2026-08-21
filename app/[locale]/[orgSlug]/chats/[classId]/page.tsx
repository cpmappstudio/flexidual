import { CourseChatPage } from "@/components/chat/course-chat-page";
import type { Id } from "@/convex/_generated/dataModel";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  return <CourseChatPage classId={classId as Id<"classes">} />;
}
