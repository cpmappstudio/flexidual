export const ROUTES = {
  org: {
    root: (orgSlug: string) => `/${orgSlug}`,
    events: {
      detail: (orgSlug: string, eventId: string) =>
        `/${orgSlug}/calendar?eventId=${encodeURIComponent(eventId)}`,
      recordings: (orgSlug: string, eventId: string, recordingId?: string) =>
        `/${orgSlug}/calendar?eventId=${encodeURIComponent(eventId)}&tab=recordings${recordingId ? `&recordingId=${encodeURIComponent(recordingId)}` : ""}`,
      chat: (orgSlug: string, eventId: string) =>
        `/${orgSlug}/chats/events/${eventId}`,
    },
    taskSubmission: (
      orgSlug: string,
      classId: string,
      taskId: string,
      studentId: string,
    ) => `/${orgSlug}/classes/${classId}?task=${taskId}&student=${studentId}`,
  },
};
