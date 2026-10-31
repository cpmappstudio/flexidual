import { EventChatPage } from "@/components/chat/event-chat-page";
import type { Id } from "@/convex/_generated/dataModel";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return <EventChatPage eventId={eventId as Id<"events">} />;
}
