import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ComponentProps } from "react";
import { CourseChatMessage } from "@/components/chat/course-chat-message";
import { CourseChatPins } from "@/components/chat/course-chat-pins";
import type { Id } from "@/convex/_generated/dataModel";
import { getFunctionName, type FunctionReference } from "convex/server";

const state = vi.hoisted(() => ({
  mobile: false,
  canPin: true,
  unread: false,
  messages: [] as ComponentProps<typeof CourseChatMessage>["message"][],
  setPinned: vi.fn().mockResolvedValue(null),
  listPinned: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useMutation: () => state.setPinned,
  useQuery: (query: FunctionReference<"query">) =>
    getFunctionName(query) === "courseChatMessages:hasUnreadPins"
      ? state.unread
      : { canPin: state.canPin },
  usePaginatedQuery: (...args: unknown[]) => {
    state.listPinned(...args);
    return { results: state.messages, status: "Exhausted", loadMore: vi.fn() };
  },
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => "1:00 PM" }),
}));
vi.mock("sonner", () => ({ toast: { error: state.error } }));

const message: ComponentProps<typeof CourseChatMessage>["message"] = {
  _id: "message" as Id<"courseChatMessages">,
  classId: "course" as Id<"classes">,
  authorId: "teacher" as Id<"users">,
  _creationTime: 1,
  body: "A message to pin",
  attachments: [],
  authorImageUrl: undefined,
  authorName: "Teacher",
  authorRole: "teacher",
  isOwn: false,
};
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  state.mobile = false;
  state.canPin = true;
  state.unread = false;
  state.messages = [];
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("pin dot uses the shared indicator and marks only the loaded snapshot seen when focused", async () => {
  const focus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
  state.unread = true;
  state.messages = [{ ...message, pinnedAt: 123 }];
  const { rerender } = render(<CourseChatPins courseId={message.classId} />);
  expect(screen.getByText("unreadPinnedMessages")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "pinnedMessages" }));
  expect(await screen.findByText(message.body)).toBeTruthy();
  expect(state.setPinned).not.toHaveBeenCalled();
  focus.mockReturnValue(true);
  fireEvent(window, new Event("focus"));
  await waitFor(() =>
    expect(state.setPinned).toHaveBeenCalledWith({
      messageId: "message",
      pinnedAt: 123,
    }),
  );
  state.unread = false;
  rerender(<CourseChatPins courseId={message.classId} />);
  expect(screen.queryByText("unreadPinnedMessages")).toBeNull();
});

test("message actions are absent for students and toggle pinning for authorized staff", async () => {
  const { rerender } = render(<CourseChatMessage message={message} />);
  expect(screen.queryByRole("button", { name: "messageOptions" })).toBeNull();
  rerender(<CourseChatMessage message={message} canPin />);
  const trigger = screen.getByRole("button", { name: "messageOptions" });
  expect(
    trigger.closest('[data-slot="bubble-content"]')?.classList.contains("pr-8"),
  ).toBe(false);
  for (const className of [
    "absolute",
    "cursor-pointer",
    "text-inherit",
    "hover:text-inherit",
    "hover:bg-transparent",
    "dark:hover:bg-transparent",
  ]) {
    expect(trigger.classList.contains(className)).toBe(true);
  }
  fireEvent.keyDown(screen.getByRole("button", { name: "messageOptions" }), {
    key: "Enter",
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: "pinMessage" }));
  await waitFor(() =>
    expect(state.setPinned).toHaveBeenCalledWith({
      messageId: "message",
      pinned: true,
    }),
  );
  rerender(
    <CourseChatMessage message={{ ...message, pinnedAt: 100 }} canPin />,
  );
  fireEvent.keyDown(screen.getByRole("button", { name: "messageOptions" }), {
    key: "Enter",
  });
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "unpinMessage" }),
  );
  await waitFor(() =>
    expect(state.setPinned).toHaveBeenCalledWith({
      messageId: "message",
      pinned: false,
    }),
  );
});

test.each([false, true])(
  "pinned panel reuses the responsive feed and subscribes only while open (mobile: %s)",
  async (mobile) => {
    state.mobile = mobile;
    state.canPin = false;
    render(<CourseChatPins courseId={"course" as Id<"classes">} />);
    expect(state.listPinned).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "pinnedMessages" }));
    expect(await screen.findByText("noPinnedMessages")).toBeTruthy();
    expect(state.listPinned).toHaveBeenCalled();
    expect(
      document.querySelector(
        mobile
          ? '[data-slot="sheet-content"]'
          : '[data-slot="popover-content"]',
      ),
    ).toBeTruthy();
  },
);
