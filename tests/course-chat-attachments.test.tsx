import {
  act,
  cleanup,
  fireEvent,
  render as renderView,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CourseChatComposer } from "@/components/chat/course-chat";
import {
  CourseChatUploadProvider,
  PendingChatMessage,
} from "@/components/chat/course-chat-pending";
import type { ReactNode } from "react";
import {
  ChatAttachment,
  ChatMessageText,
} from "@/components/chat/course-chat-attachments";
import type { Id } from "@/convex/_generated/dataModel";
import { chatTextParts, isValidChatFile } from "@/lib/chat-attachments";

const state = vi.hoisted(() => ({
  status: { isMuted: false, archived: false, canAttach: true },
  send: vi.fn().mockResolvedValue("message"),
  getToken: vi.fn().mockResolvedValue("test-token"),
  error: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useQuery: () => state.status,
  useMutation: () => state.send,
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: state.getToken }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { error: state.error } }));
vi.mock("@/components/ui/message-scroller", () => ({
  MessageScrollerItem: ({ children }: { children: ReactNode }) => (
    <div data-testid="pending-message">{children}</div>
  ),
}));

function render(children: ReactNode) {
  return renderView(
    <CourseChatUploadProvider>
      <PendingChatMessage confirmedAttachmentIds={[]} />
      {children}
    </CourseChatUploadProvider>,
  );
}

beforeEach(() => {
  state.status = { isMuted: false, archived: false, canAttach: true };
  state.send.mockClear();
  state.getToken.mockClear();
  state.error.mockClear();
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://test.convex.cloud");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ id: "attachment" })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test("only permitted participants see attach controls; text messages keep the existing API", async () => {
  state.status.canAttach = false;
  const { container } = render(
    <CourseChatComposer courseId={"course" as Id<"classes">} />,
  );
  expect(screen.queryByRole("button", { name: "attachFiles" })).toBeNull();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Hello" } });
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() =>
    expect(state.send).toHaveBeenCalledWith({
      classId: "course",
      body: "Hello",
    }),
  );
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "https://example.com" },
  });
  fireEvent.submit(container.querySelector("form")!);
  expect(state.error).toHaveBeenCalledWith("attachmentsDisabled");
  expect(state.send).toHaveBeenCalledTimes(1);
});

test("attachment menu sits before the input and opens the existing file selector", async () => {
  const { container } = render(
    <CourseChatComposer courseId={"course" as Id<"classes">} />,
  );
  const trigger = screen.getByRole("button", { name: "attachFiles" });
  expect(trigger.classList.contains("size-11")).toBe(true);
  expect(trigger.classList.contains("sm:size-12")).toBe(true);
  const inputGroup = container.querySelector('[data-slot="input-group"]')!;
  expect(inputGroup.contains(trigger)).toBe(false);
  expect(
    trigger.compareDocumentPosition(inputGroup) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  const input =
    container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const openFilePicker = vi.spyOn(input, "click").mockImplementation(() => {});
  fireEvent.keyDown(trigger, { key: "Enter" });
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "addPhotosAndFiles" }),
  );
  expect(openFilePicker).toHaveBeenCalledTimes(1);
  expect(state.send).not.toHaveBeenCalled();
});

test("uploads before sending a files-only message, using auth rather than public storage URLs", async () => {
  const { container } = render(
    <CourseChatComposer courseId={"course" as Id<"classes">} />,
  );
  const file = new File(["%PDF-1.4"], "lesson.pdf", {
    type: "application/pdf",
  });
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [file] },
  });
  expect(screen.getByText("lesson.pdf")).toBeTruthy();
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() =>
    expect(state.send).toHaveBeenCalledWith({
      classId: "course",
      body: "",
      attachmentIds: ["attachment"],
    }),
  );
  expect(state.getToken).toHaveBeenCalledWith({ template: "convex" });
  expect(fetch).toHaveBeenCalledWith(
    expect.objectContaining({
      href: "https://test.convex.site/course-chat-files?classId=course",
    }),
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
    }),
  );
  await waitFor(() => expect(screen.queryByText("lesson.pdf")).toBeNull());
});

test("rejects excess or mismatched files before any upload", () => {
  const { container } = render(
    <CourseChatComposer courseId={"course" as Id<"classes">} />,
  );
  const file = new File(["pdf"], "bad.svg", { type: "application/pdf" });
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [file] },
  });
  expect(state.error).toHaveBeenCalledWith("attachmentLimits");
  expect(fetch).not.toHaveBeenCalled();
  expect(
    isValidChatFile({
      name: "file.pdf",
      size: 10 * 1024 * 1024 + 1,
      type: "application/pdf",
    }),
  ).toBe(false);
});

test.each(["cancel", "error"])(
  "pending uploads stay in the message list and restore the draft on %s",
  async (outcome) => {
    let rejectUpload: (reason: Error) => void = () => {};
    vi.mocked(fetch).mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          rejectUpload = reject;
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const { container } = render(
      <CourseChatComposer courseId={"course" as Id<"classes">} />,
    );
    const form = container.querySelector("form")!;
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Lesson notes" },
    });
    fireEvent.change(form.querySelector('input[type="file"]')!, {
      target: {
        files: [new File(["%PDF"], "lesson.pdf", { type: "application/pdf" })],
      },
    });
    fireEvent.submit(form);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const pending = screen.getByTestId("pending-message");
    expect(pending.textContent).toContain("Lesson notes");
    expect(pending.textContent).toContain("lesson.pdf");
    expect(pending.querySelector('[data-align="end"]')).toBeTruthy();
    expect(form.contains(screen.getByRole("progressbar"))).toBe(false);
    expect(
      form.querySelector('[aria-label="cancelAttachmentUpload"]'),
    ).toBeNull();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
    if (outcome === "cancel")
      fireEvent.click(
        screen.getByRole("button", { name: "cancelAttachmentUpload" }),
      );
    else await act(async () => rejectUpload(new Error("UPLOAD_FAILED")));
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
    expect(state.send).not.toHaveBeenCalled();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
      "Lesson notes",
    );
    expect(form.textContent).toContain("lesson.pdf");
    expect(state.error).toHaveBeenCalledTimes(outcome === "error" ? 1 : 0);
  },
);

test("completed uploads await the message mutation without a duplicate pending bubble", async () => {
  let finishSend: (id: string) => void = () => {};
  state.send.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishSend = resolve;
      }),
  );
  const layout = (confirmed: string[]) => (
    <CourseChatUploadProvider>
      <PendingChatMessage confirmedAttachmentIds={confirmed} />
      <CourseChatComposer courseId={"course" as Id<"classes">} />
    </CourseChatUploadProvider>
  );
  const { container, rerender } = renderView(layout([]));
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: {
      files: [new File(["%PDF"], "lesson.pdf", { type: "application/pdf" })],
    },
  });
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() => expect(state.send).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
    "100",
  );
  expect(
    (
      screen.getByRole("button", {
        name: "cancelAttachmentUpload",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  rerender(layout(["attachment"]));
  expect(screen.queryByTestId("pending-message")).toBeNull();
  await act(async () => finishSend("message"));
  expect(screen.queryByText("lesson.pdf")).toBeNull();
});

test("only authorized new links become anchors; unsafe schemes and legacy text stay inert", () => {
  const { rerender } = render(
    <ChatMessageText body="See https://example.com." enabled={false} />,
  );
  expect(screen.queryByRole("link")).toBeNull();
  rerender(<ChatMessageText body="See https://example.com." enabled />);
  expect(screen.getByRole("link").getAttribute("href")).toBe(
    "https://example.com/",
  );
  expect(screen.getByRole("link").getAttribute("rel")).toContain("noopener");
  expect(
    chatTextParts(
      "javascript:alert(1) data:text/html,test https://user:password@example.com",
    ).some((part) => part.href),
  ).toBe(false);
});

test.each(["attachment-trigger", "attachment-action"])(
  "document %s downloads through the authenticated request",
  async (slot) => {
    vi.useFakeTimers();
    try {
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:document");
      const revoke = vi
        .spyOn(URL, "revokeObjectURL")
        .mockImplementation(() => {});
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      vi.mocked(fetch).mockResolvedValue(
        new Response(new Blob(["%PDF"], { type: "application/pdf" })),
      );
      const { container } = render(
        <ChatAttachment
          file={{
            id: "document" as Id<"courseChatAttachments">,
            name: "lesson.pdf",
            contentType: "application/pdf",
            size: 4,
          }}
        />,
      );
      expect(
        container.querySelector('[data-slot="attachment-title"]')?.textContent,
      ).toBe("lesson.pdf");
      expect(container.querySelector("button button")).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
      await act(async () =>
        fireEvent.click(container.querySelector(`[data-slot="${slot}"]`)!),
      );
      expect(click).toHaveBeenCalledTimes(1);
      expect(state.getToken).toHaveBeenCalledWith({ template: "convex" });
      await act(async () => vi.runAllTimers());
      expect(revoke).toHaveBeenCalledWith("blob:document");
    } finally {
      vi.useRealTimers();
    }
  },
);

test("image bytes are fetched only near the viewport and blob URLs are released", async () => {
  let intersect: IntersectionObserverCallback | undefined;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const create = vi
    .spyOn(URL, "createObjectURL")
    .mockReturnValue("blob:test-image");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.mocked(fetch).mockResolvedValue(
    new Response(new Blob(["image"], { type: "image/png" })),
  );
  const { unmount } = render(
    <ChatAttachment
      file={{
        id: "image" as Id<"courseChatAttachments">,
        name: "image.png",
        size: 5,
        contentType: "image/png",
      }}
    />,
  );
  expect(fetch).not.toHaveBeenCalled();
  act(() =>
    intersect?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("img").getAttribute("src")).toBe("blob:test-image");
  expect(screen.queryByText("image.png")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "downloadAttachment" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "openAttachment" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "downloadAttachment" }),
  ).toBeNull();
  unmount();
  expect(revoke).toHaveBeenCalledWith("blob:test-image");
});
