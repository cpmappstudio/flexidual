import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { BroadcastChatPage } from "@/components/chat/broadcast-chat-page";
import type { Id } from "@/convex/_generated/dataModel";

const state = vi.hoisted(() => ({ canManage: true }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useQuery: () => ({
    name: "Announcements",
    schoolId: "school",
    campusId: "campus",
    mode: "private",
    canManage: state.canManage,
    archived: false,
    settings: {
      studentsMuted: false,
      studentAttachmentsEnabled: false,
      disabled: false,
    },
  }),
  usePaginatedQuery: () => ({
    results: [],
    status: "Exhausted",
    loadMore: vi.fn(),
  }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/dynamic", () => ({
  default: () =>
    function ParticipantsDialog({ onClose }: { onClose: () => void }) {
      return (
        <div role="dialog">
          <button onClick={onClose}>Close participants</button>
        </div>
      );
    },
}));
vi.mock("@/components/chat/course-chat-pending", () => ({
  CourseChatUploadProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock("@/components/chat/course-chat", () => ({
  CourseChatMessages: () => <div>Messages</div>,
  CourseChatComposer: () => <input aria-label="Message" />,
}));
vi.mock("@/components/chat/course-chat-pins", () => ({
  CourseChatPins: () => null,
}));
vi.mock("@/components/chat/course-chat-participants", () => ({
  CourseChatParticipants: ({ footer }: { footer: ReactNode }) => (
    <aside>{footer}</aside>
  ),
}));
vi.mock("@/components/classroom/classroom-header", () => ({
  ClassroomHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/classroom/classroom-layout", () => ({
  ClassroomLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
  ClassroomLayoutStage: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
  ClassroomLayoutControls: ({ children }: { children: ReactNode }) => (
    <footer>{children}</footer>
  ),
}));
afterEach(() => {
  cleanup();
  state.canManage = true;
  vi.restoreAllMocks();
});

test("opening and closing participants in StrictMode uses distinct sibling identities and preserves the message draft", () => {
  const errors = vi.spyOn(console, "error");
  render(
    <StrictMode>
      <BroadcastChatPage broadcastId={"broadcast" as Id<"broadcasts">} />
    </StrictMode>,
  );
  const composer = screen.getByRole("textbox", { name: "Message" });
  fireEvent.change(composer, { target: { value: "Pending message" } });
  for (let i = 0; i < 2; i++) {
    fireEvent.click(
      screen.getByRole("button", { name: "broadcasts.editParticipants" }),
    );
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Message" })).toBe(composer);
    expect((composer as HTMLInputElement).value).toBe("Pending message");
    fireEvent.click(screen.getByRole("button", { name: "Close participants" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  }
  expect(
    errors.mock.calls.filter((args) =>
      args.some((value) => /same key/.test(String(value))),
    ),
  ).toEqual([]);
});

test("participants editing remains unavailable to non-administrators", () => {
  state.canManage = false;
  render(<BroadcastChatPage broadcastId={"broadcast" as Id<"broadcasts">} />);
  expect(
    screen.queryByRole("button", { name: "broadcasts.editParticipants" }),
  ).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});
