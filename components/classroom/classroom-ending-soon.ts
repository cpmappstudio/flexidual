export type ClassroomEndingSoonNoticeKey = string;

export function getClassroomEndingSoonNoticeKey({
  roomName,
  effectiveEnd,
  isPreview = false,
}: {
  roomName: string;
  effectiveEnd?: number;
  isPreview?: boolean;
}) {
  if (isPreview) return `${roomName}:preview`;
  return effectiveEnd === undefined ? null : `${roomName}:${effectiveEnd}`;
}

export function getClassroomEndingSoonStorageKey(
  noticeKey: ClassroomEndingSoonNoticeKey,
) {
  return `flexidual:classroom-ending-soon:${noticeKey}`;
}

export function shouldShowClassroomEndingSoonNotice({
  isEndingSoon,
  noticeKey,
  dismissedNoticeKey,
}: {
  isEndingSoon: boolean;
  noticeKey: ClassroomEndingSoonNoticeKey | null;
  dismissedNoticeKey: ClassroomEndingSoonNoticeKey | null;
}) {
  return isEndingSoon && noticeKey !== null && noticeKey !== dismissedNoticeKey;
}
