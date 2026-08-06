import assert from "node:assert/strict";
import test from "node:test";
import {
  createClassroomPreviewParticipants,
  getIsCompanionParticipant,
  getParticipantImageUrl,
  getParticipantRole,
} from "../components/classroom/classroom-participant";

type ParticipantInput = Parameters<typeof getParticipantRole>[0];

function participantWithMetadata(metadata?: string): ParticipantInput {
  return { metadata } as ParticipantInput;
}

test("reads classroom participant metadata", () => {
  const participant = participantWithMetadata(
    JSON.stringify({
      role: "teacher",
      imageUrl: "https://example.com/avatar.png",
      isCompanion: true,
    }),
  );

  assert.equal(getParticipantRole(participant), "teacher");
  assert.equal(
    getParticipantImageUrl(participant),
    "https://example.com/avatar.png",
  );
  assert.equal(getIsCompanionParticipant(participant), true);
});

test("preserves classroom participant fallbacks", () => {
  const invalidParticipant = participantWithMetadata("not-json");
  const emptyParticipant = participantWithMetadata();

  assert.equal(getParticipantRole(invalidParticipant), "student");
  assert.equal(getParticipantImageUrl(invalidParticipant), null);
  assert.equal(getIsCompanionParticipant(invalidParticipant), false);
  assert.equal(getParticipantRole(emptyParticipant), "student");
});

test("creates isolated student participants for the classroom preview", () => {
  const participants = createClassroomPreviewParticipants();

  assert.equal(participants.length, 10);
  assert.equal(new Set(participants.map(({ identity }) => identity)).size, 10);
  assert.ok(participants.every((participant) => !participant.isLocal));
  assert.ok(
    participants.every(
      (participant) => getParticipantRole(participant) === "student",
    ),
  );
});
