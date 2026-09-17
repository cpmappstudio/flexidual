import { StrictMode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { ChatMessage } from "@/components/chat/course-chat-message";
import { useClassroomChatNotification } from "@/hooks/use-classroom-chat-notification";

const state = vi.hoisted(() => ({
  messages: [] as ChatMessage[],
  status: "Exhausted",
  authenticated: true,
  notify: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: state.authenticated }),
  usePaginatedQuery: () => ({ results: state.messages, status: state.status }),
}));

function message(
  id: string,
  time: number,
  own = false,
  course = "course",
): ChatMessage {
  return {
    _id: id as Id<"courseChatMessages">,
    _creationTime: time,
    classId: course as Id<"classes">,
    authorId: "author" as Id<"users">,
    authorName: "Student",
    authorRole: "member",
    authorImageUrl: undefined,
    attachments: [],
    body: id,
    isOwn: own,
  };
}

function Probe({
  visible = false,
  course = "course",
}: {
  visible?: boolean;
  course?: string;
}) {
  const notification = useClassroomChatNotification({
    courseId: course as Id<"classes">,
    chatVisible: visible,
    onNotify: state.notify,
  });
  return (
    <>
      <span data-testid="message">{notification.message?.body}</span>
      <button onClick={notification.dismiss}>Dismiss</button>
    </>
  );
}

describe("classroom chat arrivals", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    state.messages = [message("history", 1)];
    state.status = "Exhausted";
    state.authenticated = true;
    state.notify.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("ignores the initial history and notifies a new incoming message once", () => {
    const view = render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    expect(screen.getByTestId("message").textContent).toBe("");
    expect(state.notify).not.toHaveBeenCalled();
    state.messages = [message("incoming", 2), ...state.messages];
    view.rerender(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    expect(screen.getByTestId("message").textContent).toBe("incoming");
    state.messages = state.messages.map((item) => ({
      ...item,
      authorName: "Updated author",
      pinnedAt: 1,
    }));
    view.rerender(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    expect(state.notify).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(6_000));
    expect(screen.getByTestId("message").textContent).toBe("");
  });

  it("does not notify own messages and still detects another author in the same update", () => {
    const view = render(<Probe />);
    state.messages = [
      message("own", 3, true),
      message("incoming", 2),
      ...state.messages,
    ];
    view.rerender(<Probe />);
    expect(screen.getByTestId("message").textContent).toBe("incoming");
    fireEvent.click(screen.getByText("Dismiss"));
    state.messages = [message("own again", 4, true), ...state.messages];
    view.rerender(<Probe />);
    expect(screen.getByTestId("message").textContent).toBe("");
    expect(state.notify).toHaveBeenCalledTimes(1);
  });

  it("replaces the preview, resets its timer and limits sounds during a burst", () => {
    const view = render(<Probe />);
    state.messages = [message("first", 2), ...state.messages];
    view.rerender(<Probe />);
    act(() => vi.advanceTimersByTime(2_000));
    state.messages = [message("second", 3), ...state.messages];
    view.rerender(<Probe />);
    expect(screen.getByTestId("message").textContent).toBe("second");
    expect(state.notify).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(4_000));
    expect(screen.getByTestId("message").textContent).toBe("second");
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByTestId("message").textContent).toBe("");
    state.messages = [message("third", 4), ...state.messages];
    view.rerender(<Probe />);
    expect(state.notify).toHaveBeenCalledTimes(2);
  });

  it("clears the preview on opening chat and does not replay messages seen there", () => {
    const view = render(<Probe />);
    state.messages = [message("incoming", 2), ...state.messages];
    view.rerender(<Probe />);
    view.rerender(<Probe visible />);
    expect(screen.getByTestId("message").textContent).toBe("");
    state.messages = [message("seen in chat", 3), ...state.messages];
    view.rerender(<Probe visible />);
    view.rerender(<Probe />);
    expect(screen.getByTestId("message").textContent).toBe("");
    expect(state.notify).toHaveBeenCalledTimes(1);
  });

  it("establishes the baseline after loading and handles an initially empty chat", () => {
    state.status = "LoadingFirstPage";
    state.messages = [];
    const view = render(<Probe />);
    state.status = "Exhausted";
    view.rerender(<Probe />);
    state.messages = [message("first message", 1)];
    view.rerender(<Probe />);
    expect(screen.getByTestId("message").textContent).toBe("first message");
    expect(state.notify).toHaveBeenCalledTimes(1);
  });

  it("distinguishes messages with equal timestamps without repeating them", () => {
    const view = render(<Probe />);
    state.messages = [message("same time", 1), ...state.messages];
    view.rerender(<Probe />);
    expect(screen.getByTestId("message").textContent).toBe("same time");
    fireEvent.click(screen.getByText("Dismiss"));
    state.messages = [...state.messages, message("older history", 0)];
    view.rerender(<Probe />);
    expect(screen.getByTestId("message").textContent).toBe("");
    expect(state.notify).toHaveBeenCalledTimes(1);
  });

  it("clears removed messages and retains its watermark when the chat is cleared", () => {
    const view = render(<Probe />);
    state.messages = [message("incoming", 2), ...state.messages];
    view.rerender(<Probe />);
    state.messages = [];
    view.rerender(<Probe />);
    expect(screen.getByTestId("message").textContent).toBe("");
    state.messages = [message("old restored history", 1)];
    view.rerender(<Probe />);
    expect(screen.getByTestId("message").textContent).toBe("");
    state.messages = [message("after clear", 3)];
    view.rerender(<Probe />);
    expect(screen.getByTestId("message").textContent).toBe("after clear");
  });

  it("resets on course changes or authentication loss and cleans up its timer", () => {
    const view = render(<Probe />);
    state.messages = [message("incoming", 2)];
    view.rerender(<Probe />);
    state.messages = [message("other history", 3, false, "other")];
    view.rerender(<Probe course="other" />);
    expect(screen.getByTestId("message").textContent).toBe("");
    state.authenticated = false;
    view.rerender(<Probe course="other" />);
    state.authenticated = true;
    view.rerender(<Probe course="other" />);
    expect(state.notify).toHaveBeenCalledTimes(1);
    state.messages = [message("other incoming", 4, false, "other")];
    view.rerender(<Probe course="other" />);
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
