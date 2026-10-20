import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ConnectionState } from "livekit-client";
import { CompanionClassroomUI } from "@/components/classroom/companion-classroom-ui";

const mocks = vi.hoisted(() => ({
  room: {
    state: "connected",
    on: vi.fn(),
    off: vi.fn(),
    disconnect: vi.fn(async () => undefined),
  },
  participant: {
    identity: "teacher-companion",
    publishData: vi.fn(
      async (_data: Uint8Array, _options: { reliable: boolean }) => undefined,
    ),
  },
}));

vi.mock("@livekit/components-react", () => ({
  useRoomContext: () => mocks.room,
  useLocalParticipant: () => ({ localParticipant: mocks.participant }),
}));

vi.mock("@/components/classroom/shared-whiteboard", () => ({
  SharedWhiteboard: () => <div data-testid="whiteboard" />,
}));

vi.mock("@/components/classroom/fullscreen-button", () => ({
  FullscreenButton: () => null,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/error-tracking", () => ({
  reportRuntimeError: vi.fn(),
  reportWhiteboardDiagnostic: vi.fn(),
}));

function storage(overrides: Partial<Storage> = {}): Storage {
  return {
    length: 0,
    clear: vi.fn(),
    getItem: vi.fn(() => null),
    key: vi.fn(() => null),
    removeItem: vi.fn(),
    setItem: vi.fn(),
    ...overrides,
  };
}

function modernMatchMedia() {
  return {
    matches: false,
    media: "",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.room.state = ConnectionState.Connected;
  vi.stubGlobal("localStorage", storage());
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(modernMatchMedia),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("the companion view mounts with modern storage and media-query APIs", () => {
  render(<CompanionClassroomUI roomName="audit-room" />);

  expect(screen.getByTestId("whiteboard")).not.toBeNull();
});

test("the companion view can present when storage access is denied", async () => {
  vi.stubGlobal(
    "localStorage",
    storage({
      getItem: vi.fn(() => {
        throw new DOMException("Access denied", "SecurityError");
      }),
    }),
  );
  render(<CompanionClassroomUI roomName="audit-room" />);
  fireEvent.click(
    screen.getByRole("button", { name: "classroom.presentBoard" }),
  );
  await waitFor(() =>
    expect(mocks.participant.publishData).toHaveBeenCalledOnce(),
  );
  expect(
    screen.getByRole("button", { name: "classroom.stopPresenting" }),
  ).not.toBeNull();
  expect(screen.getByTestId("whiteboard")).not.toBeNull();
});

test.each(["QuotaExceededError", "SecurityError"])(
  "the companion can start and stop presenting despite %s on storage writes",
  async (name) => {
    vi.stubGlobal(
      "localStorage",
      storage({
        setItem: vi.fn(() => {
          throw new DOMException("Write denied", name);
        }),
      }),
    );
    render(<CompanionClassroomUI roomName="audit-room" />);
    fireEvent.click(
      screen.getByRole("button", { name: "classroom.presentBoard" }),
    );
    await waitFor(() =>
      expect(mocks.participant.publishData).toHaveBeenCalledTimes(1),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "classroom.stopPresenting" }),
    );
    await waitFor(() =>
      expect(mocks.participant.publishData).toHaveBeenCalledTimes(2),
    );
    const states = mocks.participant.publishData.mock.calls.map(
      ([data, options]) => {
        expect(options).toEqual({ reliable: true });
        return JSON.parse(new TextDecoder().decode(data));
      },
    );
    expect(states).toMatchObject([
      {
        type: "WHITEBOARD_STATE",
        active: true,
        companionId: "teacher-companion",
      },
      {
        type: "WHITEBOARD_STATE",
        active: false,
        companionId: "teacher-companion",
      },
    ]);
    expect(
      screen.getByRole("button", { name: "classroom.presentBoard" }),
    ).not.toBeNull();
    expect(screen.getByTestId("whiteboard")).not.toBeNull();
  },
);

test("a failed storage cleanup cannot prevent leaving a presentation", async () => {
  vi.stubGlobal(
    "localStorage",
    storage({
      getItem: vi.fn(() => "true"),
      removeItem: vi.fn(() => {
        throw new DOMException("Access denied", "SecurityError");
      }),
    }),
  );
  render(<CompanionClassroomUI roomName="audit-room" />);
  await waitFor(() =>
    expect(mocks.participant.publishData).toHaveBeenCalledOnce(),
  );
  const leaveButton = screen.getAllByRole("button")[1];
  fireEvent.click(leaveButton);
  await waitFor(() => expect(mocks.room.disconnect).toHaveBeenCalledOnce());
  expect(mocks.participant.publishData).toHaveBeenLastCalledWith(
    new TextEncoder().encode(
      JSON.stringify({ type: "WHITEBOARD_STATE", active: false }),
    ),
    { reliable: true },
  );
});

test("presenting state is restored, persisted, and cleared when storage works", async () => {
  const local = storage({ getItem: vi.fn(() => "true") });
  vi.stubGlobal("localStorage", local);
  render(<CompanionClassroomUI roomName="audit-room" />);
  expect(local.getItem).toHaveBeenCalledWith("wb_presenting_audit-room");
  expect(local.setItem).toHaveBeenCalledWith(
    "wb_presenting_audit-room",
    "true",
  );
  await waitFor(() =>
    expect(mocks.participant.publishData).toHaveBeenCalledOnce(),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "classroom.stopPresenting" }),
  );
  await waitFor(() =>
    expect(local.removeItem).toHaveBeenCalledWith("wb_presenting_audit-room"),
  );
  fireEvent.click(screen.getAllByRole("button")[1]);
  await waitFor(() => expect(mocks.room.disconnect).toHaveBeenCalledOnce());
  expect(local.removeItem).toHaveBeenCalledWith("wb_presenting_audit-room");
  expect(local.clear).not.toHaveBeenCalled();
});

test("stopping stays stopped after reload when storage is full", async () => {
  const values = new Map([["wb_presenting_audit-room", "true"]]);
  const local = storage({
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn(() => {
      throw new DOMException("Full", "QuotaExceededError");
    }),
    removeItem: vi.fn((key) => {
      values.delete(key);
    }),
  });
  vi.stubGlobal("localStorage", local);
  const first = render(<CompanionClassroomUI roomName="audit-room" />);
  fireEvent.click(
    screen.getByRole("button", { name: "classroom.stopPresenting" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "classroom.presentBoard" }),
    ).not.toBeNull(),
  );
  first.unmount();
  mocks.participant.publishData.mockClear();
  render(<CompanionClassroomUI roomName="audit-room" />);
  expect(
    screen.getByRole("button", { name: "classroom.presentBoard" }),
  ).not.toBeNull();
  expect(mocks.participant.publishData).not.toHaveBeenCalled();
  expect(local.clear).not.toHaveBeenCalled();
});

test("storage failure does not bypass the connected-room requirement", () => {
  mocks.room.state = ConnectionState.Disconnected;
  vi.stubGlobal(
    "localStorage",
    storage({
      setItem: vi.fn(() => {
        throw new DOMException("Full", "QuotaExceededError");
      }),
    }),
  );
  render(<CompanionClassroomUI roomName="audit-room" />);
  fireEvent.click(
    screen.getByRole("button", { name: "classroom.presentBoard" }),
  );
  expect(mocks.participant.publishData).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "classroom.presentBoard" }),
  ).not.toBeNull();
});

test("a failed broadcast still rolls back presentation when storage is full", async () => {
  vi.stubGlobal(
    "localStorage",
    storage({
      setItem: vi.fn(() => {
        throw new DOMException("Full", "QuotaExceededError");
      }),
    }),
  );
  mocks.participant.publishData.mockRejectedValueOnce(
    new Error("Connection lost"),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(<CompanionClassroomUI roomName="audit-room" />);
  fireEvent.click(
    screen.getByRole("button", { name: "classroom.presentBoard" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "classroom.presentBoard" }),
    ).not.toBeNull(),
  );
  expect(mocks.participant.publishData).toHaveBeenCalledOnce();
  expect(screen.getByTestId("whiteboard")).not.toBeNull();
});

test("the companion view crashes when matchMedia is unavailable", () => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: undefined,
  });
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  expect(() => render(<CompanionClassroomUI roomName="audit-room" />)).toThrow(
    /matchMedia is not a function/,
  );
  consoleError.mockRestore();
});

test("the companion view crashes when matchMedia only supports the legacy listener API", () => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  expect(() => render(<CompanionClassroomUI roomName="audit-room" />)).toThrow(
    /addEventListener is not a function/,
  );
  consoleError.mockRestore();
});
