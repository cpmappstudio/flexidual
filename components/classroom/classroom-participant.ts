import { Participant } from "livekit-client";

type ParticipantMetadata = {
  role?: string;
  imageUrl?: string;
  isCompanion?: boolean;
  convexUserId?: string;
  leadershipRole?: "teacher" | "principal" | "admin" | "superadmin" | null;
};

function getParticipantMetadata(
  participant: Participant | undefined,
): ParticipantMetadata | null {
  if (!participant?.metadata) return null;

  try {
    return JSON.parse(participant.metadata) as ParticipantMetadata;
  } catch {
    return null;
  }
}

export function getParticipantRole(
  participant: Participant | undefined,
): string {
  return getParticipantMetadata(participant)?.role || "student";
}

export function getParticipantImageUrl(
  participant: Participant | undefined,
): string | null {
  return getParticipantMetadata(participant)?.imageUrl || null;
}

export function getIsCompanionParticipant(
  participant: Participant | undefined,
): boolean {
  return getParticipantMetadata(participant)?.isCompanion === true;
}

export function getParticipantConvexUserId(
  participant: Participant | undefined,
): string | null {
  return getParticipantMetadata(participant)?.convexUserId || null;
}

export function getParticipantLeadershipRole(
  participant: Participant | undefined,
): ParticipantMetadata["leadershipRole"] {
  return getParticipantMetadata(participant)?.leadershipRole;
}

const PREVIEW_STUDENT_NAMES = [
  "Sofia Ramirez",
  "Mateo Torres",
  "Emma Johnson",
  "Lucas Martinez",
  "Valentina Gomez",
  "Daniel Williams",
  "Isabella Rodriguez",
  "Samuel Brown",
  "Camila Hernandez",
  "Nicolas Davis",
] as const;

export function createClassroomPreviewParticipants(): Participant[] {
  return PREVIEW_STUDENT_NAMES.map(
    (name, index) =>
      new Participant(
        `preview-student-sid-${index + 1}`,
        `preview-student-${index + 1}`,
        name,
        JSON.stringify({ role: "student" }),
      ),
  );
}
