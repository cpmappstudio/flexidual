import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import type { BroadcastProfessor } from "@/components/chat/broadcast-professor-picker";
import { EditBroadcastParticipantsDialog } from "@/components/chat/edit-broadcast-participants-dialog";
import messages from "@/messages/en.json";

const state = vi.hoisted(() => ({
  update: vi.fn(),
  close: vi.fn(),
  loadMore: vi.fn(),
  results: [{ _id: "first", fullName: "First professor", isMuted: true }],
  status: "LoadingFirstPage",
}));
vi.mock("convex/react", () => ({
  useMutation: () => state.update,
  usePaginatedQuery: () => ({
    results: state.results,
    status: state.status,
    loadMore: state.loadMore,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/chat/broadcast-professor-picker", () => ({
  BroadcastProfessorPicker: ({
    value,
    onChange,
  }: {
    value: BroadcastProfessor[];
    onChange: (next: BroadcastProfessor[]) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange([
          { _id: "remote" as Id<"users">, fullName: "Remote professor" },
        ])
      }
    >
      {value.map((p) => p.fullName).join(", ")}
    </button>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("editing waits for all selected writers, keeps unsaved choices on reactive updates, and saves only the delta", async () => {
  state.update
    .mockRejectedValueOnce(new Error("temporary failure"))
    .mockResolvedValue(null);
  const content = () => (
    <NextIntlClientProvider locale="en" messages={messages}>
      <EditBroadcastParticipantsDialog
        broadcastId={"broadcast" as Id<"broadcasts">}
        schoolId={"school" as Id<"schools">}
        mode="school"
        onClose={state.close}
      />
    </NextIntlClientProvider>
  );
  const view = render(content());
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  state.status = "CanLoadMore";
  view.rerender(content());
  await waitFor(() => expect(state.loadMore).toHaveBeenCalledWith(40));
  state.status = "Exhausted";
  view.rerender(content());
  fireEvent.click(
    await screen.findByRole("button", { name: "First professor" }),
  );
  state.results = [
    ...state.results,
    { _id: "concurrent", fullName: "Added by another admin", isMuted: false },
  ];
  state.status = "LoadingMore";
  view.rerender(content());
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
  expect(state.update).toHaveBeenLastCalledWith({
    broadcastId: "broadcast",
    add: ["remote"],
    remove: ["first"],
  });
  expect(state.close).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: "Save" }));
  await waitFor(() => expect(state.close).toHaveBeenCalledOnce());
  expect(state.update).toHaveBeenCalledTimes(2);
  expect(state.update).toHaveBeenLastCalledWith({
    broadcastId: "broadcast",
    add: ["remote"],
    remove: ["first"],
  });
});
