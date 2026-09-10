import type { PropsWithChildren } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CourseChatMessages } from "@/components/chat/course-chat";
import { UnreadIndicator } from "@/components/notifications/unread-indicator";
import type { Id } from "@/convex/_generated/dataModel";

const state = vi.hoisted(() => ({
  visibleMessageIds: [] as string[],
  latestId: "message-1",
  markRead: vi.fn().mockResolvedValue(null),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useQuery: () => ({ canPin: false }),
  useMutation: () => state.markRead,
  usePaginatedQuery: () => ({
    status: "Exhausted",
    loadMore: vi.fn(),
    results: [
      {
        _id: state.latestId,
        _creationTime: 1,
        authorName: "Student",
        body: "Hello",
        authorRole: "member",
        isOwn: false,
      },
    ],
  }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => "12:00" }),
}));
vi.mock("@/components/ui/message-scroller", () => {
  const Container = ({ children }: PropsWithChildren) => <div>{children}</div>;
  return {
    MessageScrollerProvider: Container,
    MessageScroller: Container,
    MessageScrollerViewport: Container,
    MessageScrollerContent: Container,
    MessageScrollerItem: Container,
    MessageScrollerButton: Container,
    useMessageScrollerVisibility: () => ({
      visibleMessageIds: state.visibleMessageIds,
    }),
  };
});

beforeEach(() => {
  state.markRead.mockClear();
  state.latestId = "message-1";
  state.visibleMessageIds = [];
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("acknowledges only the latest visible message in a focused chat", () => {
  const element = () => (
    <CourseChatMessages courseId={"course" as Id<"classes">} />
  );
  const { rerender } = render(element());
  expect(state.markRead).not.toHaveBeenCalled();
  state.visibleMessageIds = ["message-1"];
  rerender(element());
  expect(state.markRead).toHaveBeenLastCalledWith({ messageId: "message-1" });
  vi.mocked(document.hasFocus).mockReturnValue(false);
  act(() => window.dispatchEvent(new Event("blur")));
  state.latestId = "message-2";
  state.visibleMessageIds = ["message-2"];
  rerender(element());
  expect(state.markRead).toHaveBeenCalledTimes(1);
  vi.mocked(document.hasFocus).mockReturnValue(true);
  act(() => window.dispatchEvent(new Event("focus")));
  expect(state.markRead).toHaveBeenLastCalledWith({ messageId: "message-2" });
  rerender(element());
  expect(state.markRead).toHaveBeenCalledTimes(2);
});

test("shares an accessible dot/count indicator and hides zero counts", () => {
  const { container, rerender, getByText } = render(
    <UnreadIndicator count={0} label="Unread" />,
  );
  expect(container.childElementCount).toBe(0);
  rerender(<UnreadIndicator count={120} label="120 unread" />);
  expect(getByText("99+")).toBeTruthy();
  expect(getByText("120 unread").className).toBe("sr-only");
  rerender(<UnreadIndicator count={2} label="2 unread" dot />);
  expect(getByText("2 unread")).toBeTruthy();
  expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
});
