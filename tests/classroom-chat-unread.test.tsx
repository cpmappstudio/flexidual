import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ClassroomParticipantsPanel } from "@/components/classroom/classroom-participants-panel";
import type { Id } from "@/convex/_generated/dataModel";

const state = vi.hoisted(() => ({ unread: new Map<string, number>() }));
vi.mock("@/hooks/use-unread-course-chats", () => ({
  useUnreadCourseChats: () => state.unread,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (_key: string, values: { count: number }) =>
    `${values.count} mensajes pendientes`,
}));
vi.mock("@/components/chat/course-chat", () => ({
  CourseChat: () => <div>Course chat</div>,
}));
vi.mock("@/components/classroom/use-classroom-participant-pagination", () => ({
  useClassroomParticipantPagination: () => ({
    gridRef: { current: null },
    startIndex: 0,
    endIndex: 0,
    canShowPrevious: false,
    canShowNext: false,
    rowCount: 0,
  }),
}));

function Panel({ courseId = "course" }: { courseId?: string }) {
  return (
    <ClassroomParticipantsPanel
      courseId={courseId as Id<"classes">}
      heading="Classmates"
      compactHeading="Classmates and chat"
      compactOpenLabel="Open panel"
      chatLabel="Chat"
      isOpen
      activeTab="participants"
      onTabChange={vi.fn()}
      previousLabel="Previous"
      nextLabel="Next"
      isEmpty
      emptyContent="No participants"
      participants={[]}
      raisedParticipantIds={new Set()}
      youLabel="You"
      raisedHandLabel="Raised hand"
      raisedHandsCountLabel={(count) => `${count} raised hands`}
      lowerHandLabel="Lower hand"
    >
      {null}
    </ClassroomParticipantsPanel>
  );
}

beforeEach(() => {
  state.unread = new Map();
});
afterEach(cleanup);

test("shows the shared unread dot only for this classroom's course", () => {
  state.unread = new Map([["other-course", 5]]);
  const { rerender } = render(<Panel />);
  const tab = screen.getByRole("tab", { name: "Chat" });
  expect(tab.querySelector(".bg-destructive")).toBeNull();
  state.unread.set("course", 2);
  rerender(<Panel />);
  expect(screen.getByRole("tab", { name: "Chat. 2 mensajes pendientes" })).toBe(
    tab,
  );
  expect(tab.querySelector(".bg-destructive.size-2")).not.toBeNull();
  // The read receipt from the existing chat updates the same subscription.
  state.unread.delete("course");
  rerender(<Panel />);
  expect(tab.querySelector(".bg-destructive")).toBeNull();
});

test("shows pending messages in the mobile launcher and chat tab", () => {
  state.unread = new Map([["course", 3]]);
  render(<Panel />);
  const launcher = screen.getByRole("button", {
    name: "Classmates and chat. Classmates: 0. 3 mensajes pendientes",
  });
  expect(launcher.querySelector(".bg-destructive.size-2")).not.toBeNull();
  fireEvent.click(launcher);
  const mobileChat = within(screen.getByRole("dialog")).getByRole("tab", {
    name: "Chat. 3 mensajes pendientes",
  });
  expect(mobileChat.querySelector(".bg-destructive.size-2")).not.toBeNull();
});
