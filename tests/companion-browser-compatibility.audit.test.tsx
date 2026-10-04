import { cleanup, render, screen } from "@testing-library/react";
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
    publishData: vi.fn(async () => undefined),
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

test("the companion view crashes when storage access is denied", () => {
  vi.stubGlobal(
    "localStorage",
    storage({
      getItem: vi.fn(() => {
        throw new DOMException("Access denied", "SecurityError");
      }),
    }),
  );
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  expect(() => render(<CompanionClassroomUI roomName="audit-room" />)).toThrow(
    /Access denied/,
  );
  consoleError.mockRestore();
});

test("the companion view crashes when storage writes are denied", () => {
  vi.stubGlobal(
    "localStorage",
    storage({
      setItem: vi.fn(() => {
        throw new DOMException("Write denied", "SecurityError");
      }),
    }),
  );
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  expect(() => render(<CompanionClassroomUI roomName="audit-room" />)).toThrow(
    /Write denied/,
  );
  consoleError.mockRestore();
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
