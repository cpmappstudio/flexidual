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
    const participants = [
      participant("student-off", "Ana", { convexUserId: "student-1" }),
      participant("companion", "Tablet", {
        convexUserId: "teacher-1",
        isCompanion: true,
      }),
      participant("teacher-on", "Carlos", { convexUserId: "teacher-1" }),
      participant("student-on", "Beatriz", { convexUserId: "student-2" }),
      participant("egress", "Recorder", {}),
    ];
    const preview = [participant("preview", "Zoe", { role: "student" })];

    const result = getMosaicParticipants(
      participants,
      preview,
      new Set(["teacher-on", "student-on"]),
    );

    expect(result.map(({ identity }) => identity)).toEqual([
      "student-on",
      "teacher-on",
      "student-off",
      "preview",
    ]);
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
