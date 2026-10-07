import type { ComponentProps, PropsWithChildren } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { getFunctionName } from "convex/server";
import { afterEach, expect, test, vi } from "vitest";
import { CourseChatPage } from "@/components/chat/course-chat-page";
import type { Id } from "@/convex/_generated/dataModel";
import type { ChatMessage } from "@/components/chat/course-chat-message";
import messages from "@/messages/es.json";

const state = vi.hoisted(() => ({
  selected: null as ChatMessage | null | undefined,
  get: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "campus" }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useMutation: () => vi.fn(),
  useQuery: (query: Parameters<typeof getFunctionName>[0], args: unknown) => {
    switch (getFunctionName(query)) {
      case "classes:getChatContext":
        return { course: { name: "Math" }, participants: [] };
      case "schedule:getMySchedule":
        return [];
      case "courseChatMessages:get":
        state.get(args);
        return state.selected;
    }
  },
}));
vi.mock("@/components/chat/course-chat", () => ({
  CourseChatMessages: () => null,
  CourseChatComposer: () => null,
}));
vi.mock("@/components/chat/course-chat-participants", () => ({
  CourseChatParticipants: () => null,
}));
vi.mock("@/components/chat/course-chat-pins", () => ({
  CourseChatPins: () => null,
}));
vi.mock("@/components/classroom/classroom-header", () => ({
  ClassroomHeader: () => null,
}));
vi.mock("@/components/chat/course-chat-pending", () => ({
  CourseChatUploadProvider: ({ children }: PropsWithChildren) => (
    <>{children}</>
  ),
}));
afterEach(() => {
  cleanup();
  state.get.mockClear();
});

test("opens an older selected event directly and handles invalid or mismatched messages without loading history", () => {
  const view = () => (
    <NextIntlClientProvider locale="es" timeZone="UTC" messages={messages}>
      <CourseChatPage
        classId={"course" as Id<"classes">}
        selectedMessageId="older-message"
      />
    </NextIntlClientProvider>
  );
  state.selected = null;
  const { rerender } = render(view());
  expect(
    screen.getByText(messages.classroom.courseEvents.messageUnavailable),
  ).toBeTruthy();
  expect(state.get).toHaveBeenCalledWith({ messageId: "older-message" });
  expect(
    screen
      .getByRole("link", {
        name: messages.classroom.courseEvents.closeSelectedMessage,
      })
      .getAttribute("href"),
  ).toBe("/campus/chats/course");
  state.selected = {
    _id: "message" as Id<"courseChatMessages">,
    classId: "course" as Id<"classes">,
    _creationTime: 1,
    authorName: "Flexidual",
    authorRole: "system",
    isOwn: false,
    body: "fallback",
    event: {
      kind: "course_task",
      taskId: "task" as Id<"courseTasks">,
      title: "Older task",
      available: true,
    },
  };
  rerender(view());
  expect(screen.getByText("Older task")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Ver tarea" })).toBeTruthy();
  state.selected = { ...state.selected, classId: "other" as Id<"classes"> };
  rerender(view());
  expect(screen.queryByText("Older task")).toBeNull();
  expect(
    screen.getByText(messages.classroom.courseEvents.messageUnavailable),
  ).toBeTruthy();
});
