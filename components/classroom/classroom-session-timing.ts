import { getClassroomEndingSoonNoticeKey } from "./classroom-ending-soon";

type ClassroomEndingSoonTiming = {
  effectiveEnd: number;
  warningStartsAt: number;
  hardEndsAt?: number;
};

export function getClassroomEndingSoonState({
  roomName,
  now,
  timing,
  isPreview = false,
}: {
  roomName: string;
  now: number;
  timing: ClassroomEndingSoonTiming | null | undefined;
  isPreview?: boolean;
}) {
  if (isPreview) {
    return {
      isEndingSoon: true,
      noticeKey: getClassroomEndingSoonNoticeKey({ roomName, isPreview: true }),
    };
  }

  const canWarn =
    timing &&
    (timing.hardEndsAt === undefined ||
      timing.effectiveEnd < timing.hardEndsAt) &&
    now >= timing.warningStartsAt &&
    now < timing.effectiveEnd;

  return {
    isEndingSoon: Boolean(canWarn),
    noticeKey: canWarn
      ? getClassroomEndingSoonNoticeKey({
          roomName,
          effectiveEnd: timing.effectiveEnd,
        })
      : null,
  };
}
