import { Id } from "@/convex/_generated/dataModel"

/**
 * Student-facing schedule event
 * This is what students see in their hub - simplified from the full schedule event
 */
export interface StudentScheduleEvent {
  scheduleId: Id<"classSchedule">
  title: string
  description?: string
  className: string
  start: number
  end: number
  roomName: string
  isLive: boolean
  color: string
  status: "scheduled" | "active" | "completed" | "cancelled"
}