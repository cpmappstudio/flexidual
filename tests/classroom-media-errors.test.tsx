import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomEvent } from "livekit-client";

const toastError = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { error: toastError },
}));

import {
  useClassroomMediaDeviceErrors,
  useClassroomMediaErrorHandler,
} from "@/hooks/use-classroom-media-errors";

describe("classroom media errors", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it.each([
    ["NotAllowedError", "classroom.mediaPermissionDenied", "PermissionDenied"],
    ["NotFoundError", "classroom.mediaDeviceNotFound", "NotFound"],
    ["NotReadableError", "classroom.mediaDeviceInUse", "DeviceInUse"],
    ["AbortError", "classroom.mediaDeviceError", "Other"],
  ])("maps %s to a useful message", (name, message, failure) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderHook(() => useClassroomMediaErrorHandler());

    act(() => result.current(new DOMException("Media failed", name)));

    expect(toastError).toHaveBeenCalledWith(message, {
      id: `classroom-media-${failure}`,
    });
  });

  it("subscribes once and removes the same room listener", () => {
    const room = {
      on: vi.fn(),
      off: vi.fn(),
    };
    const { unmount } = renderHook(() =>
      useClassroomMediaDeviceErrors(room as never),
    );

    expect(room.on).toHaveBeenCalledTimes(1);
    expect(room.on).toHaveBeenCalledWith(
      RoomEvent.MediaDevicesError,
      expect.any(Function),
    );
    const handler = room.on.mock.calls[0][1];

    unmount();

    expect(room.off).toHaveBeenCalledWith(RoomEvent.MediaDevicesError, handler);
  });
});
