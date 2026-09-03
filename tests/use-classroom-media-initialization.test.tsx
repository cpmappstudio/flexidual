import { StrictMode, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import type { LocalParticipant } from "livekit-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useClassroomMediaInitialization } from "@/hooks/use-classroom-media-initialization";

function createParticipant() {
  return {
    isCameraEnabled: false,
    isMicrophoneEnabled: false,
    setCameraEnabled: vi.fn(async () => undefined),
    setMicrophoneEnabled: vi.fn(async () => undefined),
  } as unknown as LocalParticipant;
}

describe("useClassroomMediaInitialization", () => {
  afterEach(() => vi.restoreAllMocks());

  it("initializes each device only once across eligibility changes", async () => {
    const participant = createParticipant();
    const { rerender } = renderHook(
      ({ shouldInitialize }) =>
        useClassroomMediaInitialization(participant, shouldInitialize),
      { initialProps: { shouldInitialize: false } },
    );

    expect(participant.setMicrophoneEnabled).not.toHaveBeenCalled();
    expect(participant.setCameraEnabled).not.toHaveBeenCalled();

    rerender({ shouldInitialize: true });
    await waitFor(() => {
      expect(participant.setCameraEnabled).toHaveBeenCalledTimes(1);
    });

    rerender({ shouldInitialize: false });
    rerender({ shouldInitialize: true });

    expect(participant.setMicrophoneEnabled).toHaveBeenCalledTimes(1);
    expect(participant.setCameraEnabled).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate initialization when React replays effects", async () => {
    const participant = createParticipant();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    );

    renderHook(() => useClassroomMediaInitialization(participant, true), {
      wrapper,
    });

    await waitFor(() => {
      expect(participant.setCameraEnabled).toHaveBeenCalledTimes(1);
    });
    expect(participant.setMicrophoneEnabled).toHaveBeenCalledTimes(1);
  });

  it("does not automatically retry after the browser denies permission", async () => {
    const permissionError = new DOMException(
      "Permission denied",
      "NotAllowedError",
    );
    const participant = createParticipant();
    vi.mocked(participant.setMicrophoneEnabled).mockRejectedValue(
      permissionError,
    );
    vi.mocked(participant.setCameraEnabled).mockRejectedValue(permissionError);
    const onError = vi.fn();

    const { rerender } = renderHook(
      ({ tick }) => {
        void tick;
        useClassroomMediaInitialization(participant, true, onError);
      },
      { initialProps: { tick: 0 } },
    );

    await waitFor(() => {
      expect(participant.setCameraEnabled).toHaveBeenCalledTimes(1);
    });

    rerender({ tick: 1 });
    rerender({ tick: 2 });

    expect(participant.setMicrophoneEnabled).toHaveBeenCalledTimes(1);
    expect(participant.setCameraEnabled).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError.mock.calls.map(([error]) => error.name)).toEqual([
      "NotAllowedError",
      "NotAllowedError",
    ]);
  });

  it("preserves devices that are already enabled", async () => {
    const participant = createParticipant();
    Object.assign(participant, {
      isCameraEnabled: true,
      isMicrophoneEnabled: true,
    });

    renderHook(() => useClassroomMediaInitialization(participant, true));

    await waitFor(() => {
      expect(participant.setMicrophoneEnabled).not.toHaveBeenCalled();
      expect(participant.setCameraEnabled).not.toHaveBeenCalled();
    });
  });
});
