import { Participant } from "livekit-client";
import { describe, expect, it } from "vitest";
import {
  getMosaicLayout,
  getMosaicParticipants,
} from "@/components/classroom/classroom-mosaic";

function participant(
  identity: string,
  name: string,
  metadata: Record<string, unknown>,
) {
  return new Participant(identity, identity, name, JSON.stringify(metadata));
}

describe("getMosaicParticipants", () => {
  it("shows connected people with cameras first and excludes devices and egress", () => {
    const students = [
      participant("student-off", "Ana", { convexUserId: "student-1" }),
      participant("companion", "Tablet", {
        convexUserId: "teacher-1",
        isCompanion: true,
      }),
      participant("student-on", "Beatriz", { convexUserId: "student-2" }),
      participant("egress", "Recorder", {}),
    ];
    const presenter = participant("teacher-on", "Carlos", {
      role: "teacher",
      convexUserId: "teacher-1",
    });
    const preview = [participant("preview", "Zoe", { role: "student" })];

    const result = getMosaicParticipants(students, preview, {
      presenter,
      cameraEnabledIds: new Set(["teacher-on", "student-on"]),
    });

    expect(result.map(({ identity }) => identity)).toEqual([
      "student-on",
      "teacher-on",
      "student-off",
      "preview",
    ]);
  });

  it("includes the selected administrative leader exactly once", () => {
    const presenter = participant("admin-leader", "Carlos", {
      role: "admin",
      convexUserId: "admin-1",
    });
    const student = participant("student", "Ana", {
      role: "student",
      convexUserId: "student-1",
    });

    expect(
      getMosaicParticipants([student, presenter], [], { presenter }).map(
        ({ identity }) => identity,
      ),
    ).toEqual(["student", "admin-leader"]);
  });
});

describe("getMosaicLayout", () => {
  it("fills a wide stage with four columns and three rows for twelve people", () => {
    expect(getMosaicLayout(12, 1360, 700)).toEqual({
      columns: 4,
      rows: 3,
      rowHeight: undefined,
    });
  });

  it("keeps a readable minimum and scrolls when the stage is too small", () => {
    expect(getMosaicLayout(12, 320, 300)).toEqual({
      columns: 2,
      rows: 6,
      rowHeight: 90,
    });
  });
});
