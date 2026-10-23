import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { CourseChatReferenceInput } from "@/components/chat/course-chat-reference-input";
import { ChatMessageText } from "@/components/chat/course-chat-message-text";
import {
  CourseChatMessage,
  type ChatMessage,
} from "@/components/chat/course-chat-message";
import type { Id } from "@/convex/_generated/dataModel";
import messages from "@/messages/es.json";
import { taskChatReference } from "@/lib/chat-references";

const state = vi.hoisted(() => ({
  tasks: [
    { taskId: "task1", title: "Fracciones" },
    { taskId: "task2", title: "Geometría" },
  ],
  query: vi.fn(),
  send: vi.fn(),
  loadMore: vi.fn(),
}));
vi.mock("convex/react", () => ({
  usePaginatedQuery: (_query: unknown, args: unknown) => {
    state.query(args);
    return {
      results: args === "skip" ? [] : state.tasks,
      status: "Exhausted",
      loadMore: state.loadMore,
    };
  },
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "campus" }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));

function Composer() {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        state.send(value);
      }}
    >
      <CourseChatReferenceInput
        courseId={"course" as Id<"classes">}
        value={value}
        onChange={setValue}
        disabled={false}
        placeholder="Mensaje"
      />
      <output data-testid="draft">{value}</output>
    </form>
  );
}
function setup() {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <Composer />
    </NextIntlClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("slash opens existing course task autocomplete; keyboard inserts a reference without sending, and Escape keeps the draft", async () => {
  setup();
  expect(state.query).toHaveBeenLastCalledWith("skip");
  const input = screen.getByRole("textbox");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Recuerda /" } });
  const option = await screen.findByRole("option", { name: "Fracciones" });
  expect(option).toBeTruthy();
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() =>
    expect(screen.getByTestId("draft").textContent).toContain("](task:"),
  );
  expect(state.send).not.toHaveBeenCalled();
  expect(screen.getByTestId("draft").textContent).toMatch(/^Recuerda \[/);
  fireEvent.change(input, { target: { value: "/" } });
  await screen.findByRole("option", { name: "Fracciones" });
  fireEvent.keyDown(input, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  expect(screen.getByTestId("draft").textContent).toBe("/");
  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.getByTestId("draft").textContent).toBe("/");
  expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(true);
});

test("mouse selection inserts the selected task and queries only while a slash is active", async () => {
  setup();
  const input = screen.getByRole("textbox");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "/" } });
  fireEvent.click(await screen.findByRole("option", { name: "Geometría" }));
  expect(screen.getByTestId("draft").textContent).toBe(
    taskChatReference("task2", "Geometría") + " ",
  );
  expect(state.send).not.toHaveBeenCalled();
  expect((input as HTMLInputElement).value).toBe("Geometría ");
  const reference = document.querySelector("[data-chat-draft-reference]")!;
  expect(reference.textContent).toBe("Geometría");
  expect(reference.classList.contains("underline")).toBe(true);
  expect((input as HTMLInputElement).value).not.toContain("task:");
  await waitFor(() => expect(state.query).toHaveBeenLastCalledWith("skip"));
  fireEvent.submit(input.closest("form")!);
  expect(state.send).toHaveBeenCalledWith(
    taskChatReference("task2", "Geometría") + " ",
  );
});

test("formatted draft references survive typing, undo, redo and copying into the same chat", async () => {
  setup();
  const input = screen.getByRole("textbox") as HTMLInputElement;
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "/" } });
  fireEvent.click(await screen.findByRole("option", { name: "Geometría" }));
  await waitFor(() => expect(input.selectionStart).toBe(10));
  const source = taskChatReference("task2", "Geometría");
  fireEvent.change(input, {
    target: { value: "Geometría listo", selectionStart: 15, selectionEnd: 15 },
  });
  expect(screen.getByTestId("draft").textContent).toBe(source + " listo");
  fireEvent.keyDown(input, { key: "z", ctrlKey: true });
  expect(input.value).toBe("Geometría ");
  fireEvent.keyDown(input, { key: "z", ctrlKey: true });
  expect(input.value).toBe("/");
  fireEvent.keyDown(input, { key: "z", ctrlKey: true, shiftKey: true });
  expect(screen.getByTestId("draft").textContent).toBe(source + " ");
  await waitFor(() => expect(input.selectionStart).toBe(10));
  input.setSelectionRange(0, 9);
  fireEvent.select(input);
  const clipboard = new Map<string, string>();
  const clipboardData = {
    setData: (type: string, value: string) => clipboard.set(type, value),
    getData: (type: string) => clipboard.get(type) ?? "",
  };
  fireEvent.copy(input, { clipboardData });
  expect(clipboard.get("text/plain")).toBe("Geometría");
  expect(clipboard.get("application/x-flexidual-chat")).toBe(source);
  input.setSelectionRange(10, 10);
  fireEvent.select(input);
  fireEvent.paste(input, { clipboardData });
  expect(input.value).toBe("Geometría Geometría");
  expect(screen.getByTestId("draft").textContent).toBe(`${source} ${source}`);
});

test("internal task references navigate within the current campus without enabling external links", () => {
  const body =
    taskChatReference("task1", "Fracciones") + " https://example.com";
  const { rerender } = render(
    <ChatMessageText
      body={body}
      enabled={false}
      classId={"course" as Id<"classes">}
      availableTaskIds={["task1" as Id<"courseTasks">]}
    />,
  );
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(
    screen.getByRole("link", { name: "Fracciones" }).getAttribute("href"),
  ).toBe("/campus/classes/course?task=task1");
  rerender(<ChatMessageText body={body} enabled={false} />);
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.getByText(/Fracciones/)).toBeTruthy();
});

test("task links require reader access and become plain labels when access changes", () => {
  const body = taskChatReference("task1", "Fracciones");
  const props = { body, enabled: true, classId: "course" as Id<"classes"> };
  const { rerender } = render(<ChatMessageText {...props} />);
  expect(screen.queryByRole("link")).toBeNull();
  rerender(
    <ChatMessageText
      {...props}
      availableTaskIds={["task1" as Id<"courseTasks">]}
    />,
  );
  expect(screen.getByRole("link", { name: "Fracciones" })).toBeTruthy();
  rerender(<ChatMessageText {...props} availableTaskIds={[]} />);
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.getByText("Fracciones")).toBeTruthy();
  expect(screen.queryByText(/task:/)).toBeNull();
});

test("chat bubbles use server task availability while notification previews stay non-interactive", () => {
  const taskId = "task1" as Id<"courseTasks">;
  const message: ChatMessage = {
    _id: "message" as Id<"courseChatMessages">,
    _creationTime: 1,
    classId: "course" as Id<"classes">,
    body: taskChatReference(taskId, "Fracciones"),
    authorName: "Teacher",
    authorRole: "teacher",
    isOwn: false,
    availableTaskIds: [taskId],
  };
  function bubble(availableTaskIds: Id<"courseTasks">[], preview = false) {
    return (
      <NextIntlClientProvider locale="es" messages={messages}>
        <CourseChatMessage
          message={{ ...message, availableTaskIds }}
          preview={preview}
        />
      </NextIntlClientProvider>
    );
  }
  const { rerender } = render(bubble([taskId]));
  expect(screen.getByRole("link", { name: "Fracciones" })).toBeTruthy();
  rerender(bubble([]));
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.getByText("Fracciones")).toBeTruthy();
  rerender(bubble([taskId], true));
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.getByText("Fracciones")).toBeTruthy();
});

test("task suggestions are portaled inside the fullscreen classroom", async () => {
  const fullscreen = document.createElement("div");
  document.body.append(fullscreen);
  const descriptor = Object.getOwnPropertyDescriptor(
    document,
    "fullscreenElement",
  );
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreen,
  });
  try {
    setup();
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "/" } });
    await screen.findByRole("option", { name: "Fracciones" });
    expect(fullscreen.querySelector('[role="listbox"]')).not.toBeNull();
  } finally {
    if (descriptor)
      Object.defineProperty(document, "fullscreenElement", descriptor);
    else Reflect.deleteProperty(document, "fullscreenElement");
    fullscreen.remove();
  }
});
