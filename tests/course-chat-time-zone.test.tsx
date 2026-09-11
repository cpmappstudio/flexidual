import type { PropsWithChildren } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, test, vi } from "vitest";
import { CourseChatMessages } from "@/components/chat/course-chat";
import { CourseChatParticipants } from "@/components/chat/course-chat-participants";
import type { Id } from "@/convex/_generated/dataModel";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

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
  useQuery: () => ({ canPin: false }),
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

function Chat({ children }: PropsWithChildren) {
  return (
    <NextIntlClientProvider
      locale="en"
      timeZone="UTC"
      messages={{
        classroom: {
          classChatDescription: "Course chat",
          scrollToLatestMessages: "Latest messages",
          teacher: "Teacher",
          tutor: "Tutor",
          student: "Student",
          participants: "Participants",
          courseParticipantsCount: "{count} participants",
        },
      }}
    >
      {children ?? <CourseChatMessages courseId={"course" as Id<"classes">} />}
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  state.messages = [];
});

test.each([false, true])(
  "teacher styling is consistent in chat and participants (own: %s)",
  (isOwn) => {
    const roles = ["teacher", "teacher", "tutor", "member"];
    state.messages = roles
      .map((role, index) => ({
        _id: `message-${index}`,
        _creationTime: index + 1,
        authorId: role,
        authorName: role,
        authorRole: role,
        body: `Message ${index}`,
        isOwn: role === "teacher" && isOwn,
      }))
      .reverse();
    const { container, getAllByRole, rerender, getByText } = render(<Chat />);
    expect(
      [...container.querySelectorAll('[data-slot="bubble"]')].map((bubble) =>
        bubble.getAttribute("data-variant"),
      ),
    ).toEqual(["default", "default", "tinted", "secondary"]);
    expect(getAllByRole("img", { name: "Teacher" })).toHaveLength(1);
    expect(
      getAllByRole("img", { name: "Teacher" })[0].getAttribute("src"),
    ).toBe("/professors-icon.svg");

    rerender(
      <Chat>
        <CourseChatParticipants
          classId={"course" as Id<"classes">}
          participants={(["teacher", "tutor", "student"] as const).map(
            (role) => ({
              _id: role as Id<"users">,
              fullName: `${role} name`,
              role,
              isMuted: false,
            }),
          )}
          isOpen
          canModerate={false}
          canDisableChat={false}
          chatSettings={{ studentsMuted: false, disabled: false }}
        />
      </Chat>,
    );
    expect(getAllByRole("img", { name: "Teacher" })).toHaveLength(1);
    expect(getByText("teacher name").classList.contains("text-primary")).toBe(
      true,
    );
    expect(getByText("tutor name").classList.contains("text-primary")).toBe(
      false,
    );
    expect(getByText("student name").classList.contains("text-primary")).toBe(
      false,
    );
  },
);

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
      const text = bubble.querySelector("p")!;
      expect(text.classList.contains("text-left")).toBe(true);
      expect(text.classList.contains("flex-1")).toBe(true);
      expect(text.parentElement?.classList.contains("justify-end")).toBe(false);
      expect(text.nextElementSibling?.tagName).toBe("TIME");
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
