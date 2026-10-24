import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { ClassroomNotebookPicker } from "@/components/classroom/classroom-notebook-picker";
const state = vi.hoisted(() => ({
  select: vi.fn(),
  props: {} as {
    classId: Id<"classes">;
    onSelectPage: (id: Id<"courseNotebookPages">) => Promise<void>;
  },
}));
vi.mock("@livekit/components-react", () => ({
  useRoomContext: () => ({ name: "physical-activation" }),
}));
vi.mock("convex/react", () => ({ useMutation: () => state.select }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/dynamic", () => ({
  default: () => (props: typeof state.props) => {
    state.props = props;
    return <div>gallery</div>;
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
test("selecting a notebook page stays inside the call and waits for the authorized source switch", async () => {
  let release!: () => void;
  state.select.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  render(
    <ClassroomNotebookPicker
      classId={"course" as Id<"classes">}
      roomName="occurrence"
    >
      {(action) => (
        <div data-testid="active-editor">{action(false, {} as never)}</div>
      )}
    </ClassroomNotebookPicker>,
  );
  fireEvent.click(screen.getByRole("button", { name: "tab" }));
  expect(state.props.classId).toBe("course");
  let pending!: Promise<void>;
  act(() => {
    pending = state.props.onSelectPage("page-a" as Id<"courseNotebookPages">);
    void state.props.onSelectPage("page-b" as Id<"courseNotebookPages">);
  });
  expect(state.select).toHaveBeenCalledExactlyOnceWith({
    roomName: "occurrence",
    expectedLiveRoomName: "physical-activation",
    pageId: "page-a",
  });
  expect(screen.queryByTestId("active-editor")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText("gallery")).toBeTruthy();
  expect(screen.getByRole("button", { name: "back" })).toHaveProperty(
    "disabled",
    true,
  );
  await act(async () => {
    release();
    await pending;
  });
  expect(screen.queryByText("gallery")).toBeNull();
  expect(screen.getByTestId("active-editor")).toBeTruthy();
  state.select.mockResolvedValue(null);
  fireEvent.click(screen.getByRole("button", { name: "tab" }));
  fireEvent.click(screen.getByRole("button", { name: "sessionBoard" }));
  await act(async () => {});
  expect(state.select).toHaveBeenLastCalledWith({
    roomName: "occurrence",
    expectedLiveRoomName: "physical-activation",
    pageId: null,
  });
});

test("a rejected selection keeps the gallery open and can retry without changing the active page", async () => {
  state.select
    .mockRejectedValueOnce(new Error("PERMISSION_DENIED"))
    .mockResolvedValue(null);
  render(
    <ClassroomNotebookPicker
      classId={"course" as Id<"classes">}
      roomName="occurrence"
    >
      {(action) => (
        <div data-testid="active-editor">{action(false, {} as never)}</div>
      )}
    </ClassroomNotebookPicker>,
  );
  fireEvent.click(screen.getByRole("button", { name: "tab" }));
  await act(async () =>
    state.props.onSelectPage("page-a" as Id<"courseNotebookPages">),
  );
  expect(screen.getByText("gallery")).toBeTruthy();
  expect(screen.queryByTestId("active-editor")).toBeNull();
  await act(async () =>
    state.props.onSelectPage("page-b" as Id<"courseNotebookPages">),
  );
  expect(screen.queryByText("gallery")).toBeNull();
  expect(screen.getByTestId("active-editor")).toBeTruthy();
  expect(state.select).toHaveBeenLastCalledWith({
    roomName: "occurrence",
    expectedLiveRoomName: "physical-activation",
    pageId: "page-b",
  });
});

test("Back remounts the current editor without changing the live selection or leaving a hidden editor", async () => {
  render(
    <ClassroomNotebookPicker
      classId={"course" as Id<"classes">}
      roomName="occurrence"
    >
      {(action) => (
        <div data-testid="active-editor">{action(false, {} as never)}</div>
      )}
    </ClassroomNotebookPicker>,
  );
  for (let i = 0; i < 3; i++) {
    expect(screen.getAllByTestId("active-editor")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "tab" }));
    expect(screen.queryByTestId("active-editor")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "back" }));
    expect(screen.queryByText("gallery")).toBeNull();
  }
  expect(state.select).not.toHaveBeenCalled();
});
