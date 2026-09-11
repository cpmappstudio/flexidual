import { render, screen } from "@testing-library/react";
import type { Participant } from "livekit-client";
import { describe, expect, it, vi } from "vitest";
import { ClassroomParticipantTile } from "@/components/classroom/classroom-participant-tile";

vi.mock("@livekit/components-react", () => ({
  useIsSpeaking: () => false,
  VideoTrack: ({ className }: { className?: string }) => (
    <video data-testid="participant-video" className={className} />
  ),
}));

const participant = {
  identity: "teacher-1",
  name: "Teacher",
  isLocal: false,
  metadata: JSON.stringify({ role: "teacher" }),
  getTrackPublication: () => ({
    isSubscribed: true,
    isMuted: false,
  }),
} as unknown as Participant;

describe("ClassroomParticipantTile", () => {
  it("preserves the full camera frame on the main stage", () => {
    render(
      <ClassroomParticipantTile participant={participant} variant="stage" />,
    );

    expect(screen.getByTestId("participant-video").className).toContain(
      "object-contain",
    );
    expect(screen.getByTestId("participant-video").className).not.toContain(
      "object-cover",
    );
  });
});
