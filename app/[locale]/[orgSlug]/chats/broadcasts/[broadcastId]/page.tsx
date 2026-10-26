import { BroadcastChatPage } from "@/components/chat/broadcast-chat-page";
import type { Id } from "@/convex/_generated/dataModel";

export default async function Page({
  params,
}: {
  params: Promise<{ broadcastId: string }>;
}) {
  const { broadcastId } = await params;
  return (
    <BroadcastChatPage
      key={broadcastId}
      broadcastId={broadcastId as Id<"broadcasts">}
    />
  );
}
