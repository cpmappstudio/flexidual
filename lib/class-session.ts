export type ClassSessionType = "live" | "ignitia" | "abeka";

type ClassSessionState = {
  status?: "scheduled" | "active" | "completed" | "cancelled";
  isLive?: boolean;
  sessionType?: ClassSessionType;
};

export function isLiveClassSession(session: ClassSessionState) {
  return (
    !isExternalClassSession(session.sessionType) &&
    session.status === "active" &&
    session.isLive === true
  );
}

export function isUpcomingClassSession(
  session: ClassSessionState,
  end: number,
  now: number,
) {
  return (
    session.status !== "completed" &&
    session.status !== "cancelled" &&
    (end > now || isLiveClassSession(session))
  );
}

export function isExternalClassSession(
  sessionType: ClassSessionType | undefined,
) {
  return sessionType === "ignitia" || sessionType === "abeka";
}
