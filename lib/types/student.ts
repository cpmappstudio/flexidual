import { Id } from "@/convex/_generated/dataModel";
import type { ClassSessionType } from "@/lib/class-session";

/**
 * Student-facing schedule event
 * This is what students see in their hub - simplified from the full schedule event
 */
export interface StudentScheduleEvent {
  scheduleId: Id<"classSchedule">;
  title: string;
  description?: string;
  className: string;
  start: number;
  end: number;
  timeZone: string;
  roomName: string;
  isLive: boolean;
  color: string;
  status: "scheduled" | "active" | "completed" | "cancelled";
  sessionType?: ClassSessionType;
  attendance:
    | "upcoming"
    | "present"
    | "absent"
    | "partial"
    | "in-progress"
    | "late"
    | "excused";
  minutesAttended: number;
  isStudentActive: boolean;
  hasRecording?: boolean;
}
