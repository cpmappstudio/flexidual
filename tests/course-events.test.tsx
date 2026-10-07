import type { ComponentProps } from "react";
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { CourseChatMessage } from "@/components/chat/course-chat-message";
import { useUnreadCourseChats } from "@/hooks/use-unread-course-chats";
import type { Id } from "@/convex/_generated/dataModel";
import messages from "@/messages/es.json";

vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "campus" }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useMutation: () => vi.fn(),
  useQuery: () => ({ type: "campus", _id: "campus" }),
  usePaginatedQuery: () => ({
    status: "Exhausted",
    loadMore: vi.fn(),
    results: [
      { classId: "course", campusId: "campus", count: 2 },
      { classId: "course", campusId: "campus", count: 1 },
      { classId: "course", campusId: "other", count: 5 },
    ],
  }),
}));
afterEach(cleanup);
const message: ComponentProps<typeof CourseChatMessage>["message"] = {
  _id: "message" as Id<"courseChatMessages">,
  classId: "course" as Id<"classes">,
  _creationTime: 1,
  authorName: "Flexidual",
  authorRole: "system",
  isOwn: false,
  body: "A fallback that should not be displayed",
  attachments: [],
  event: {
    kind: "course_task",
    taskId: "task" as Id<"courseTasks">,
    title: "Una tarea con un título largo y completo",
    available: true,
  },
};

test("renders the localized character and task preview without nested interactive elements", () => {
  const view = (preview = false, available = true) => (
    <NextIntlClientProvider locale="es" timeZone="UTC" messages={messages}>
      <CourseChatMessage
        message={{ ...message, event: { ...message.event!, available } }}
        preview={preview}
      />
    </NextIntlClientProvider>
  );
  const { rerender, container } = render(view());
  expect(
    container
      .querySelector('[data-slot="bubble"]')
      ?.getAttribute("data-variant"),
  ).toBe("event");
  expect(
    screen.getByText(messages.classroom.courseEvents.taskPublished),
  ).toBeTruthy();
  expect(screen.getByText(message.event!.title)).toBeTruthy();
  expect(screen.queryByText(message.body)).toBeNull();
  expect(
    screen.getByRole("link", { name: "Ver tarea" }).getAttribute("href"),
  ).toBe("/campus/classes/course?task=task");
  const avatar = container.querySelector('[data-slot="avatar"] img');
  expect(avatar?.getAttribute("src")).toContain(
    encodeURIComponent("/astronaut/jump.png"),
  );
  expect(avatar?.className).toContain("object-contain");
  rerender(view(true));
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.getByText(message.event!.title)).toBeTruthy();
  rerender(view(false, false));
  expect(screen.queryByRole("link")).toBeNull();
  expect(
    screen.getByText(messages.classroom.courseEvents.unavailable),
  ).toBeTruthy();
});

test("adds independent event notices to the human chat count in the current campus", () => {
  const { result } = renderHook(() => useUnreadCourseChats());
  expect(result.current.get("course" as Id<"classes">)).toBe(3);
  expect(result.current.size).toBe(1);
});
