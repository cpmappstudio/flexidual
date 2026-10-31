import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { Participant } from "livekit-client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ClassroomParticipantsPanel } from "@/components/classroom/classroom-participants-panel";
import {
  ClassroomPresentationContext,
  type ClassroomPresentation,
} from "@/components/classroom/classroom-presentation";
import type { Id } from "@/convex/_generated/dataModel";

const state = vi.hoisted(() => ({
  unread: new Map<string, number>(),
  eventUnread: new Map<string, number>(),
  unreadCalls: 0,
}));
vi.mock("@/hooks/use-unread-event-chats", () => ({
  useUnreadEventChats: () => state.eventUnread,
}));
vi.mock("@/hooks/use-unread-course-chats", () => ({
  useUnreadCourseChats: () => {
    state.unreadCalls++;
    return state.unread;
  },
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (_key: string, values: { count: number }) =>
    `${values.count} mensajes pendientes`,
}));
vi.mock("@/components/chat/course-chat", () => ({
  CourseChat: () => <div>Course chat</div>,
  EventChat: () => <div>Event chat</div>,
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
    endIndex: 1,
    canShowPrevious: false,
    canShowNext: false,
    rowCount: 0,
  }),
}));

function Panel({
  courseId = "course",
  eventId,
  notification = false,
  activeTab = "participants",
  viewMode,
  isOpen = true,
  onTabChange = vi.fn(),
  onOpenChange = vi.fn(),
  tile,
  participants = [],
  isEmpty = true,
  onSelectMosaicParticipant,
}: {
  courseId?: string;
  eventId?: string;
  notification?: boolean;
  activeTab?: "participants" | "chat";
  viewMode?: "presenter" | "mosaic";
  isOpen?: boolean;
  onTabChange?: (tab: "participants" | "chat") => void;
  onOpenChange?: (open: boolean) => void;
  tile?: ReactNode;
  participants?: Participant[];
  isEmpty?: boolean;
  onSelectMosaicParticipant?: (identity: string) => void;
}) {
  return (
    <ClassroomParticipantsPanel
      courseId={courseId as Id<"classes">}
      eventId={eventId as Id<"events"> | undefined}
      heading="Classmates"
      compactHeading="Classmates and chat"
      compactOpenLabel="Open panel"
      chatLabel="Chat"
      isOpen={isOpen}
      activeTab={activeTab}
      viewMode={viewMode}
      onTabChange={onTabChange}
      onOpenChange={onOpenChange}
      notificationTargetRef={notification ? { current: null } : undefined}
      previousLabel="Previous"
      nextLabel="Next"
      isEmpty={isEmpty}
      emptyContent="No participants"
      participants={participants}
      onSelectMosaicParticipant={onSelectMosaicParticipant}
      raisedParticipantIds={new Set()}
      youLabel="You"
      raisedHandLabel="Raised hand"
      raisedHandsCountLabel={(count) => `${count} raised hands`}
      lowerHandLabel="Lower hand"
    >
      {tile ?? null}
    </ClassroomParticipantsPanel>
  );
}

beforeEach(() => {
  state.unread = new Map();
  state.eventUnread = new Map();
  state.unreadCalls = 0;
});

test("event participants use the event thread and its unread count", () => {
  state.eventUnread.set("event-1", 2);
  render(<Panel eventId="event-1" />);
  expect(state.unreadCalls).toBe(0);
  expect(
    screen.getByRole("tab", { name: "Chat. 2 mensajes pendientes" }),
  ).toBeTruthy();
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

test("opens mobile chat by default in mosaic and restores the previous tab", () => {
  const view = render(<Panel viewMode="presenter" />);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Classmates and chat. Classmates: 0",
    }),
  );
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog)
      .getByRole("tab", { name: "Classmates" })
      .getAttribute("data-state"),
  ).toBe("active");

  view.rerender(<Panel viewMode="mosaic" />);
  expect(
    within(dialog)
      .getByRole("tab", { name: "Chat" })
      .getAttribute("data-state"),
  ).toBe("active");

  view.rerender(<Panel viewMode="presenter" />);
  expect(
    within(dialog)
      .getByRole("tab", { name: "Classmates" })
      .getAttribute("data-state"),
  ).toBe("active");
});

test("does not mount duplicate participant tiles while mosaic chat is visible", () => {
  const tile = <span data-testid="participant-video">Video</span>;
  const view = render(<Panel viewMode="mosaic" activeTab="chat" tile={tile} />);
  expect(screen.queryByTestId("participant-video")).toBeNull();

  view.rerender(
    <Panel viewMode="mosaic" activeTab="participants" tile={tile} />,
  );
  expect(screen.queryByTestId("participant-video")).toBeNull();
});

test("shows a roster instead of duplicate video tiles in mosaic participants", () => {
  const participant = new Participant("student-1", "student-1", "Sofia", "{}");
  const selectParticipant = vi.fn();
  const tile = <span data-testid="participant-video">Video</span>;
  const view = render(
    <Panel
      viewMode="mosaic"
      activeTab="participants"
      participants={[participant]}
      isEmpty={false}
      tile={tile}
      onSelectMosaicParticipant={selectParticipant}
    />,
  );

  expect(screen.queryByTestId("participant-video")).toBeNull();
  fireEvent.click(screen.getByText("Sofia").closest("button")!);
  expect(selectParticipant).toHaveBeenCalledWith("student-1");

  view.rerender(
    <Panel
      viewMode="presenter"
      activeTab="participants"
      participants={[participant]}
      isEmpty={false}
      tile={tile}
    />,
  );
  expect(screen.getByTestId("participant-video")).toBeTruthy();
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
