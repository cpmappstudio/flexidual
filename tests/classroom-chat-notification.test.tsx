import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClassroomChatNotification } from "@/components/classroom/classroom-chat-notification";
import type { ChatMessage } from "@/components/chat/course-chat-message";
import type { Id } from "@/convex/_generated/dataModel";
import messages from "@/messages/es.json";

const state = vi.hoisted(() => ({
  message: null as ChatMessage | null,
  dismiss: vi.fn(),
}));
vi.mock("@/hooks/use-classroom-chat-notification", () => ({
  useClassroomChatNotification: () => state,
}));
vi.mock("@/hooks/use-notification-chime", () => ({
  useNotificationChime: () => vi.fn(),
}));
vi.mock("framer-motion", async () => {
  const { createElement } = await import("react");
  return {
    useReducedMotion: () => true,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
      button: ({
        initial,
        animate,
        exit,
        transition,
        ...props
      }: Record<string, unknown>) => {
        void initial;
        void animate;
        void exit;
        void transition;
        return createElement("button", props);
      },
    },
  };
});

let target: HTMLDivElement;
beforeEach(() => {
  state.dismiss.mockClear();
  target = document.createElement("div");
  document.body.append(target);
  state.message = {
    _id: "message" as Id<"courseChatMessages">,
    _creationTime: 1,
    classId: "course" as Id<"classes">,
    authorId: "author" as Id<"users">,
    authorName: "Laura",
    authorImageUrl: undefined,
    authorRole: "teacher",
    isOwn: false,
    body: "Revisen https://example.com",
    linksEnabled: true,
    attachments: [
      {
        id: "file" as Id<"courseChatAttachments">,
        name: "Actividad.pdf",
        contentType: "application/pdf",
        size: 10,
      },
    ],
  };
});
afterEach(() => {
  cleanup();
  target.remove();
});

describe("floating classroom chat message", () => {
  it.each([
    ["teacher", "default"],
    ["tutor", "tinted"],
    ["member", "secondary"],
  ] as const)(
    "preserves the %s message style and opens chat without attachment or link actions",
    (role, variant) => {
      state.message!.authorRole = role;
      const open = vi.fn();
      render(
        <NextIntlClientProvider locale="es" timeZone="UTC" messages={messages}>
          <ClassroomChatNotification
            courseId={"course" as Id<"classes">}
            chatVisible={false}
            targetRef={{ current: target }}
            onOpenChat={open}
          />
        </NextIntlClientProvider>,
      );
      const button = screen.getByRole("button", { name: /Abrir chat/ });
      expect(target.contains(button)).toBe(true);
      expect(
        target
          .querySelector('[data-slot="bubble"]')
          ?.getAttribute("data-variant"),
      ).toBe(variant);
      expect(screen.getByText("Actividad.pdf")).toBeTruthy();
      expect(target.querySelector("a")).toBeNull();
      expect(target.querySelector("time")).toBeNull();
      expect(target.querySelector(".line-clamp-3")).not.toBeNull();
      expect(
        target.querySelector('[role="status"]')?.getAttribute("aria-live"),
      ).toBe("polite");
      fireEvent.click(button);
      expect(state.dismiss).toHaveBeenCalledTimes(1);
      expect(open).toHaveBeenCalledTimes(1);
    },
  );
});
