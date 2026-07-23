import { defineTable } from "convex/server";
import { v } from "convex/values";
import { defineModuleTables } from "../../lib/modules";
import {
  liveClassAttendanceStatusValidator,
  liveClassParticipantRoleValidator,
  liveClassSessionStatusValidator,
} from "./validators";

export const liveClassTables = defineModuleTables({
  liveClassSeries: defineTable({
    organizationId: v.id("organizations"),
    campusId: v.id("campuses"),
    title: v.string(),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org_id_and_campus_id_and_updated_at", [
    "organizationId",
    "campusId",
    "updatedAt",
  ]),
  liveClassSessions: defineTable({
    organizationId: v.id("organizations"),
    campusId: v.id("campuses"),
    seriesId: v.id("liveClassSeries"),
    teacherOrganizationPersonId: v.id("organizationPeople"),
    title: v.string(),
    scheduledStartAt: v.number(),
    scheduledEndAt: v.optional(v.number()),
    status: liveClassSessionStatusValidator,
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org_id_and_campus_id_and_scheduled_start_at", [
      "organizationId",
      "campusId",
      "scheduledStartAt",
  ]),
  liveClassParticipants: defineTable({
    organizationId: v.id("organizations"),
    sessionId: v.id("liveClassSessions"),
    organizationPersonId: v.id("organizationPeople"),
    role: liveClassParticipantRoleValidator,
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org_id_and_session_id_and_op_id", [
      "organizationId",
      "sessionId",
      "organizationPersonId",
    ])
    .index("by_org_id_and_op_id", [
      "organizationId",
      "organizationPersonId",
    ]),
  liveClassAttendanceRecords: defineTable({
    organizationId: v.id("organizations"),
    sessionId: v.id("liveClassSessions"),
    organizationPersonId: v.id("organizationPeople"),
    status: liveClassAttendanceStatusValidator,
    firstJoinedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org_id_and_session_id_and_op_id", [
      "organizationId",
      "sessionId",
      "organizationPersonId",
    ])
    .index("by_org_id_and_op_id", [
      "organizationId",
      "organizationPersonId",
    ]),
});
