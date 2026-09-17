import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ClassroomParticipantsPanel } from "@/components/classroom/classroom-participants-panel";
import {
  ClassroomPresentationContext,
  type ClassroomPresentation,
} from "@/components/classroom/classroom-presentation";
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
vi.mock("@/components/classroom/classroom-chat-notification", () => ({
  ClassroomChatNotification: ({
    chatVisible,
    onOpenChat,
  }: {
    chatVisible: boolean;
    onOpenChat: () => void;
  }) => (
    <button onClick={onOpenChat}>
      {chatVisible ? "Chat visible" : "Chat notification"}
    </button>
  ),
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

function Panel({
  courseId = "course",
  notification = false,
  activeTab = "participants",
  isOpen = true,
  onTabChange = vi.fn(),
  onOpenChange = vi.fn(),
}: {
  courseId?: string;
  notification?: boolean;
  activeTab?: "participants" | "chat";
  isOpen?: boolean;
  onTabChange?: (tab: "participants" | "chat") => void;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <ClassroomParticipantsPanel
      courseId={courseId as Id<"classes">}
      heading="Classmates"
      compactHeading="Classmates and chat"
      compactOpenLabel="Open panel"
      chatLabel="Chat"
      isOpen={isOpen}
      activeTab={activeTab}
      onTabChange={onTabChange}
      onOpenChange={onOpenChange}
      notificationTargetRef={notification ? { current: null } : undefined}
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
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

function desktop(matches: boolean) {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

test("notifies while desktop chat is hidden and opens its existing panel", () => {
  desktop(true);
  const tab = vi.fn();
  const open = vi.fn();
  const view = render(
    <Panel
      notification
      activeTab="chat"
      isOpen={false}
      onTabChange={tab}
      onOpenChange={open}
    />,
  );
  fireEvent.click(screen.getByText("Chat notification"));
  expect(tab).toHaveBeenCalledWith("chat");
  expect(open).toHaveBeenCalledWith(true);
  view.rerender(<Panel notification activeTab="chat" />);
  expect(screen.getByText("Chat visible")).toBeTruthy();
});

test("keeps the notification suppressed when an open desktop chat loses focus", () => {
  desktop(true);
  render(<Panel notification activeTab="chat" />);
  vi.mocked(document.hasFocus).mockReturnValue(false);
  fireEvent.blur(window);
  expect(screen.getByText("Chat visible")).toBeTruthy();
  expect(screen.queryByText("Chat notification")).toBeNull();
});

test("opens the existing mobile chat sheet from the notification", () => {
  desktop(false);
  render(<Panel notification />);
  fireEvent.click(screen.getByText("Chat notification"));
  expect(
    within(screen.getByRole("dialog")).getByText("Course chat"),
  ).toBeTruthy();
  expect(screen.getByText("Chat visible")).toBeTruthy();
  vi.mocked(document.hasFocus).mockReturnValue(false);
  fireEvent.blur(window);
  expect(screen.getByText("Chat visible")).toBeTruthy();
  expect(screen.queryByText("Chat notification")).toBeNull();
});

test("restores a compact classroom before opening chat", () => {
  desktop(true);
  const restore = vi.fn();
  const tab = vi.fn();
  render(
    <ClassroomPresentationContext.Provider
      value={
        {
          mode: "compact",
          returnToClassroom: restore,
        } as unknown as ClassroomPresentation
      }
    >
      <Panel notification activeTab="chat" onTabChange={tab} />
    </ClassroomPresentationContext.Provider>,
  );
  fireEvent.click(screen.getByText("Chat notification"));
  expect(restore).toHaveBeenCalledTimes(1);
  expect(tab).toHaveBeenCalledWith("chat");
});
