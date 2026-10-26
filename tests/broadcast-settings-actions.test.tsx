import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { getFunctionName } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import {
  BroadcastNameSetting,
  DeleteBroadcastAction,
} from "@/components/chat/broadcast-settings-actions";
import { CourseChatParticipants } from "@/components/chat/course-chat-participants";
import messages from "@/messages/en.json";

const state = vi.hoisted(() => ({
  rename: vi.fn(),
  remove: vi.fn(),
  replace: vi.fn(),
  mobile: false,
  context: { name: "Announcements", canManage: true, archived: false },
}));
vi.mock("convex/react", () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference) === "broadcasts:context" ? state.context : [],
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference) === "broadcasts:rename"
      ? state.rename
      : state.remove,
}));
vi.mock("@/hooks/use-org-base-path", () => ({
  useOrgBasePath: () => "/campus",
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: state.replace }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile }));
vi.mock("@/components/classroom/classroom-layout", () => ({
  ClassroomLayoutSidebar: ({ children }: { children: React.ReactNode }) => (
    <aside>{children}</aside>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
beforeEach(() => {
  state.context = { name: "Announcements", canManage: true, archived: false };
  state.mobile = false;
  state.rename.mockReset().mockResolvedValue(null);
  state.remove.mockReset().mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const broadcastId = "broadcast" as Id<"broadcasts">;
function view() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BroadcastNameSetting broadcastId={broadcastId} />
      <DeleteBroadcastAction broadcastId={broadcastId} />
    </NextIntlClientProvider>,
  );
}

test("rename requires a changed, nonempty name and retains edits after failure", async () => {
  state.rename.mockRejectedValueOnce(new Error("temporary failure"));
  view();
  const input = screen.getByRole("textbox", { name: "Name" });
  const save = screen.getByRole("button", { name: "Save" });
  expect(save.getAttribute("data-size")).toBe("icon");
  expect(save.textContent).toBe("");
  expect(save.parentElement).toBe(input.parentElement);
  expect((save as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(input, { target: { value: "   " } });
  expect((save as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(input, { target: { value: "School news" } });
  fireEvent.click(save);
  await waitFor(() => expect(state.rename).toHaveBeenCalledOnce());
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
  expect((input as HTMLInputElement).value).toBe("School news");
  fireEvent.click(save);
  await waitFor(() => expect(state.rename).toHaveBeenCalledTimes(2));
  expect(state.rename).toHaveBeenLastCalledWith({
    broadcastId,
    name: "School news",
  });
  expect(state.remove).not.toHaveBeenCalled();
});

test("delete requires explicit confirmation, blocks duplicate submission, retries failure, and navigates only after success", async () => {
  let reject!: (error: Error) => void;
  state.remove.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  view();
  fireEvent.click(screen.getByRole("button", { name: "Delete broadcast" }));
  let dialog = screen.getByRole("alertdialog");
  expect(within(dialog).getByText(/permanently deletes/)).toBeTruthy();
  expect(state.remove).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Delete broadcast" }));
  dialog = screen.getByRole("alertdialog");
  const confirm = within(dialog).getByRole("button", {
    name: "Delete broadcast",
  });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(state.remove).toHaveBeenCalledOnce();
  expect((confirm as HTMLButtonElement).disabled).toBe(true);
  expect(state.replace).not.toHaveBeenCalled();
  reject(new Error("temporary failure"));
  await waitFor(() =>
    expect((confirm as HTMLButtonElement).disabled).toBe(false),
  );
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  fireEvent.click(confirm);
  await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/campus"));
  expect(state.remove).toHaveBeenCalledTimes(2);
  expect(state.remove).toHaveBeenLastCalledWith({ broadcastId });
});

test("rename is not offered to non-administrators or archived broadcasts", () => {
  state.context.canManage = false;
  const result = view();
  expect(screen.queryByRole("textbox")).toBeNull();
  state.context = { ...state.context, canManage: true, archived: true };
  result.rerender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BroadcastNameSetting broadcastId={broadcastId} />
    </NextIntlClientProvider>,
  );
  expect(screen.queryByRole("textbox")).toBeNull();
});

test.each([false, true])(
  "shared settings replace archive only for broadcasts (mobile=%s)",
  async (mobile) => {
    state.mobile = mobile;
    const content = (broadcast: boolean, canModerate = true) => (
      <NextIntlClientProvider locale="en" messages={messages}>
        <CourseChatParticipants
          {...(broadcast
            ? { broadcastId }
            : { classId: "course" as Id<"classes"> })}
          participants={[]}
          isOpen
          canModerate={canModerate}
          canDisableChat={canModerate}
          chatSettings={{ studentsMuted: false, disabled: false }}
        />
      </NextIntlClientProvider>
    );
    const rendered = render(content(true));
    if (mobile)
      fireEvent.click(
        screen.getByRole("button", { name: "0 course participants" }),
      );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Settings" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      await screen.findByRole("button", { name: "Delete broadcast" }),
    ).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Name" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Archive chat" })).toBeNull();
    rendered.rerender(content(false));
    expect(
      await screen.findByRole("button", { name: "Archive chat" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Delete broadcast" }),
    ).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    rendered.rerender(content(true, false));
    expect(screen.queryByRole("tab", { name: "Settings" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Delete broadcast" }),
    ).toBeNull();
  },
);
