import type { PropsWithChildren } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, test, vi } from "vitest";
import { CourseChatMessages } from "@/components/chat/course-chat";
import type { Id } from "@/convex/_generated/dataModel";

const state = vi.hoisted(() => ({
  timestamp: 0,
  messages: [] as {
    _id: string;
    _creationTime: number;
    authorId: string;
    authorName: string;
    body: string;
    authorRole: string;
    isOwn: boolean;
  }[],
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useMutation: () => vi.fn().mockResolvedValue(null),
  usePaginatedQuery: () => ({
    status: "Exhausted",
    loadMore: vi.fn(),
    results: state.messages.length
      ? state.messages
      : [
          {
            _id: "message",
            _creationTime: state.timestamp,
            authorId: "student",
            authorName: "Student",
            body: "Hello",
            authorRole: "member",
            isOwn: false,
          },
        ],
  }),
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
    useMessageScrollerVisibility: () => ({ visibleMessageIds: [] }),
  };
});

function simulateBrowserTimeZone(timeZone: string) {
  const resolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
  return vi
    .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
    .mockImplementation(function (this: Intl.DateTimeFormat) {
      return { ...resolvedOptions.call(this), timeZone };
    });
}

function Chat() {
  return (
    <NextIntlClientProvider
      locale="en"
      timeZone="UTC"
      messages={{
        classroom: {
          classChatDescription: "Course chat",
          scrollToLatestMessages: "Latest messages",
        },
      }}
    >
      <CourseChatMessages courseId={"course" as Id<"classes">} />
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  state.messages = [];
});

test.each([
  ["America/Bogota", "2026-09-09T19:08:00Z", "September 9, 2026", "2:08 PM"],
  [
    "America/Tegucigalpa",
    "2026-09-09T19:08:00Z",
    "September 9, 2026",
    "1:08 PM",
  ],
  ["UTC", "2026-09-09T19:08:00Z", "September 9, 2026", "7:08 PM"],
  ["America/Bogota", "2026-09-10T01:08:00Z", "September 9, 2026", "8:08 PM"],
  ["America/New_York", "2026-07-09T19:08:00Z", "July 9, 2026", "3:08 PM"],
  ["America/New_York", "2026-01-09T19:08:00Z", "January 9, 2026", "2:08 PM"],
])(
  "formats chat timestamps in %s at %s instead of inheriting the server zone",
  (zone, iso, day, hour) => {
    state.timestamp = Date.parse(iso);
    const detect = simulateBrowserTimeZone(zone);
    const { container, rerender, getByRole } = render(<Chat />);
    const timestamp = container.querySelector("time")!;
    expect(getByRole("separator", { name: day }).textContent).toBe(day);
    expect(timestamp.textContent).not.toContain(day);
    expect(timestamp.textContent).toContain(hour);
    expect(timestamp.title).toBe(zone);
    expect(timestamp.dateTime).toBe(new Date(state.timestamp).toISOString());
    const detections = detect.mock.calls.length;
    rerender(<Chat />);
    expect(detect).toHaveBeenCalledTimes(detections);
  },
);

test("waits for the browser zone without rendering a misleading UTC time or a hydration mismatch", async () => {
  state.timestamp = Date.parse("2026-09-09T19:08:00Z");
  const detect = simulateBrowserTimeZone("America/Bogota");
  const container = document.createElement("div");
  container.innerHTML = renderToString(<Chat />);
  expect(container.querySelector("time")?.textContent).toBe("");
  expect(detect).not.toHaveBeenCalled();
  document.body.appendChild(container);
  const onRecoverableError = vi.fn();
  let root: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, <Chat />, { onRecoverableError });
  });
  expect(container.querySelector("time")?.textContent).toContain("2:08 PM");
  expect(onRecoverableError).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  container.remove();
});

test.each([false, true])(
  "groups by author identity, six-message limit and local day, including across loaded pages (own: %s)",
  (isOwn) => {
    simulateBrowserTimeZone("America/Bogota");
    const start = Date.parse("2026-09-10T04:50:00Z");
    const chronological = Array.from({ length: 12 }, (_, index) => ({
      _id: `message-${index}`,
      _creationTime: start + index * 60_000,
      authorId: index === 7 ? "other-student" : "student",
      // Identical names must not merge different authors.
      authorName: "Student",
      body: `Message ${index}`,
      authorRole: "member",
      isOwn,
    }));
    state.messages = chronological.slice(5).reverse();
    const { container, rerender, getAllByRole } = render(<Chat />);
    state.messages = [...chronological].reverse();
    rerender(<Chat />);

    const bubbles = [
      ...container.querySelectorAll('[data-slot="bubble-content"]'),
    ];
    expect(bubbles).toHaveLength(12);
    for (const bubble of bubbles) {
      const startsGroup = Boolean(bubble.querySelector(".font-bold"));
      expect(
        bubble.classList.contains(isOwn ? "rounded-br-sm" : "rounded-bl-sm"),
      ).toBe(startsGroup);
      expect(
        bubble.classList.contains(isOwn ? "rounded-bl-sm" : "rounded-br-sm"),
      ).toBe(false);
      expect(bubble.classList.contains("rounded-xl")).toBe(true);
    }
    const messages = [...container.querySelectorAll('[data-slot="message"]')];
    expect(
      messages.map((message) =>
        Boolean(message.querySelector('[data-slot="avatar"]')),
      ),
    ).toEqual(
      bubbles.map((bubble) => Boolean(bubble.querySelector(".font-bold"))),
    );
    expect(
      bubbles.map((bubble) => Boolean(bubble.querySelector(".font-bold"))),
    ).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      false,
      true,
      false,
    ]);
    expect(
      bubbles.map((bubble) => bubble.querySelector("p")?.textContent),
    ).toEqual(chronological.map((message) => message.body));
    expect(
      bubbles.every(
        (bubble) =>
          bubble.querySelector("time")?.textContent?.includes("PM") ||
          bubble.querySelector("time")?.textContent?.includes("AM"),
      ),
    ).toBe(true);
    expect(
      getAllByRole("separator").map((separator) => separator.textContent),
    ).toEqual(["September 9, 2026", "September 10, 2026"]);
    expect(container.querySelector('[data-slot="message-header"]')).toBeNull();
  },
);
